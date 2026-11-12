#!/usr/bin/env bash
# Starts or restarts everything Xrostr needs, in order:
#   PostgreSQL (Docker) -> dependencies -> build -> migrations -> API + worker (systemd user services)
# then checks the API locally and through the Cloudflare Tunnel. Safe to run again at any time.
set -euo pipefail

REPO="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
SERVICES=(xrostr-api xrostr-worker)
LOCAL_HEALTH="http://127.0.0.1:8015/health"
PUBLIC_HEALTH="https://xrostr.cloud/health"

step() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
ok() { printf '\033[1;32m  ✓\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m  !\033[0m %s\n' "$1"; }
fail() {
  printf '\033[1;31m  ✗ %s\033[0m\n' "$1" >&2
  exit 1
}

cd "$REPO"

step "Checking prerequisites"
for cmd in docker node pnpm systemctl curl; do
  command -v "$cmd" >/dev/null || fail "$cmd is not installed"
done
[[ -f .env ]] || fail ".env is missing: copy .env.example to .env and fill in the secrets"
ok "docker, node, pnpm, systemctl, curl and .env present"

step "Starting PostgreSQL"
docker compose up -d --wait postgres >/dev/null 2>&1 ||
  fail "PostgreSQL did not become healthy: docker compose logs postgres"
ok "PostgreSQL is healthy"

step "Installing dependencies"
pnpm install --frozen-lockfile --silent
ok "dependencies up to date"

step "Building"
pnpm -s build >/dev/null
ok "build finished"

step "Applying database migrations"
pnpm -s db:migrate
pnpm -s db:seed

step "Installing services"
mkdir -p "$UNIT_DIR"
for svc in "${SERVICES[@]}"; do
  # The units in deploy/systemd assume ~/inroster/inroster-hrms; point them at this checkout.
  sed "s#%h/inroster/inroster-hrms#$REPO#g" "deploy/systemd/$svc.service" >"$UNIT_DIR/$svc.service"
done
systemctl --user daemon-reload
systemctl --user enable "${SERVICES[@]}" >/dev/null 2>&1
ok "units installed in $UNIT_DIR"

step "Restarting API and worker"
systemctl --user restart "${SERVICES[@]}"
for svc in "${SERVICES[@]}"; do
  systemctl --user is-active --quiet "$svc" || fail "$svc did not start: journalctl --user -u $svc -n 50"
done
ok "${SERVICES[*]} running"

step "Checking the API"
for _ in $(seq 1 30); do
  curl -fsS --max-time 2 "$LOCAL_HEALTH" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS --max-time 2 "$LOCAL_HEALTH" >/dev/null 2>&1 ||
  fail "API is not answering on $LOCAL_HEALTH: journalctl --user -u xrostr-api -n 50"
ok "local:  $LOCAL_HEALTH"

if curl -fsS --max-time 15 "$PUBLIC_HEALTH" >/dev/null 2>&1; then
  ok "public: $PUBLIC_HEALTH"
else
  warn "public check failed for $PUBLIC_HEALTH (is cloudflared running?)"
fi

printf '\n\033[1;32mXrostr is up.\033[0m Logs: journalctl --user -u xrostr-api -f\n'
