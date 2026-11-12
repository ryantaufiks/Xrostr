import { migrateDatabase } from '@xrostr/db/migrate';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

const APP_PASSWORD = 'xrostr_app_test';

declare module 'vitest' {
  export interface ProvidedContext {
    ownerUrl: string;
    appUrl: string;
  }
}

/** One real Postgres for the integration suite, migrated exactly like production. */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:17-alpine')
    .withUsername('xrostr_owner')
    .withPassword('xrostr_owner_test')
    .withDatabase('xrostr')
    .start();

  const ownerUrl = container.getConnectionUri();
  await migrateDatabase({ ownerUrl, appPassword: APP_PASSWORD });

  const appUrl = new URL(ownerUrl);
  appUrl.username = 'xrostr_app';
  appUrl.password = APP_PASSWORD;

  project.provide('ownerUrl', ownerUrl);
  project.provide('appUrl', appUrl.toString());

  return async () => {
    await container.stop();
  };
}
