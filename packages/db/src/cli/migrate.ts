import { migrateDatabase } from '../migrate.js';
import { requireEnv } from './env.js';

await migrateDatabase({
  ownerUrl: requireEnv('DATABASE_OWNER_URL'),
  appPassword: requireEnv('DATABASE_APP_PASSWORD'),
});
console.log('Database migrated.');
