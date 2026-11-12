export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing environment variable ${name}. Copy .env.example to .env first.`);
    process.exit(1);
  }
  return value;
}
