import { migrateDatabase } from '@inroster/db/migrate';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

const APP_PASSWORD = 'hrms_app_test';

declare module 'vitest' {
  export interface ProvidedContext {
    ownerUrl: string;
    appUrl: string;
  }
}

/** One real Postgres for the integration suite, migrated exactly like production. */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:17-alpine')
    .withUsername('hrms_owner')
    .withPassword('hrms_owner_test')
    .withDatabase('inroster_hrms')
    .start();

  const ownerUrl = container.getConnectionUri();
  await migrateDatabase({ ownerUrl, appPassword: APP_PASSWORD });

  const appUrl = new URL(ownerUrl);
  appUrl.username = 'hrms_app';
  appUrl.password = APP_PASSWORD;

  project.provide('ownerUrl', ownerUrl);
  project.provide('appUrl', appUrl.toString());

  return async () => {
    await container.stop();
  };
}
