import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url:
      process.env.DATABASE_OWNER_URL ??
      'postgres://hrms_owner:hrms_owner_dev@127.0.0.1:5440/inroster_hrms',
  },
});
