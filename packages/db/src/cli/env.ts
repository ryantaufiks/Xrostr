export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing environment variable ${name}. Copy .env.example to .env first.`);
    process.exit(1);
  }
  return value;
}

const MIN_SUPERADMIN_PASSWORD = 16;

/**
 * The superadmin can reach every tenant, so its password must be long and must not be
 * a value published anywhere (such as the old .env.example placeholder).
 */
export function requireSuperadminPassword(): string {
  const password = requireEnv('SEED_SUPERADMIN_PASSWORD');
  if (password.length < MIN_SUPERADMIN_PASSWORD || /changeme/i.test(password)) {
    console.error(
      `SEED_SUPERADMIN_PASSWORD must be at least ${MIN_SUPERADMIN_PASSWORD} characters and not a placeholder.\n` +
        `Generate one: node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`,
    );
    process.exit(1);
  }
  return password;
}
