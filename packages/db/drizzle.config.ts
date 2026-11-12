import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url:
      process.env.DATABASE_OWNER_URL ??
      'postgres://xrostr_owner:xrostr_owner_dev@127.0.0.1:5440/xrostr',
  },
});
