import { z } from 'zod';

const base64Key = (bytes: number) =>
  z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === bytes,
      `Must be ${bytes} bytes, base64-encoded`,
    );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().default('inroster-hrms'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  FIELD_ENCRYPTION_KEY: base64Key(32),
  RATE_LIMIT_ENABLED: z.stringbool().default(true),
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  jwt: { secret: string; issuer: string; accessTtlSeconds: number; refreshTtlSeconds: number };
  fieldEncryptionKey: Buffer;
  rateLimitEnabled: boolean;
}

/** Injection token for the validated configuration. */
export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  return {
    env: env.NODE_ENV,
    port: env.API_PORT,
    databaseUrl: env.DATABASE_URL,
    jwt: {
      secret: env.JWT_SECRET,
      issuer: env.JWT_ISSUER,
      accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
    },
    fieldEncryptionKey: Buffer.from(env.FIELD_ENCRYPTION_KEY, 'base64'),
    rateLimitEnabled: env.RATE_LIMIT_ENABLED,
  };
}
