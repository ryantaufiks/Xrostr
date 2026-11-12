# ADR 0003: Authentication, sessions and 2FA

Status: accepted (2026-11-12)

## Decision

- Passwords: Argon2id (19 MiB, 2 passes, 1 lane, OWASP baseline). Unknown users still cost one
  hash verification, so timing does not reveal which emails exist.
- Lockout: 5 consecutive failures lock the account for 15 minutes. Unknown tenant, unknown user
  and wrong password return the same `invalid_credentials` answer.
- Access token: JWT HS256 (jose), 15 minutes, carrying subject, tenant, session id, stage and
  permissions. Permission changes apply on the next refresh.
- Refresh token: opaque `<sessionId>.<secret>`, 30 days, stored as SHA-256. Every refresh rotates
  it inside a session family. Replaying a rotated token revokes the whole family and is written
  to the platform audit log.
- 2FA: TOTP (RFC 6238). Mandatory for platform admins, Tenant Admin and HR. Until enrolled they
  receive a `mfa_setup` session that only reaches `/auth/mfa/*`, `/auth/me` and `/auth/logout`.
  TOTP secrets are encrypted with AES-256-GCM (`FIELD_ENCRYPTION_KEY`).
- Rate limits: 120 requests per minute per client, 10 per minute on credential endpoints.
- Tenant users sign in with `tenantSlug + email + password`; the same email may exist in
  several tenants.

## Planned hardening

- Asymmetric signing (EdDSA) with key rotation and a JWKS endpoint, once other services verify
  tokens.
- TOTP replay protection (remember the last accepted time step) and recovery codes.
- Per-tenant encryption keys through a KMS (envelope encryption) instead of one app key.
- OIDC/SAML single sign-on for enterprise tenants.
