import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabase, type DatabaseHandle } from '@inroster/db';
import {
  AuditLogger,
  Clock,
  EventPublisher,
  SecretCipher,
  TenantDirectory,
  UnitOfWork,
} from './application/ports.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { DrizzleAuditLogger } from './infrastructure/audit/drizzle-audit-logger.js';
import { AesGcmCipher } from './infrastructure/crypto/aes-gcm-cipher.js';
import { DATABASE, DatabaseContext } from './infrastructure/database/database-context.js';
import { DrizzleTenantDirectory } from './infrastructure/database/drizzle-tenant-directory.js';
import { OutboxEventPublisher } from './infrastructure/outbox/outbox-event-publisher.js';
import { SystemClock } from './infrastructure/system-clock.js';

const DATABASE_HANDLE = Symbol('DATABASE_HANDLE');

/** Cross-cutting adapters available to every module. Config is provided by AppModule. */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_HANDLE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createDatabase(config.databaseUrl),
    },
    { provide: DATABASE, inject: [DATABASE_HANDLE], useFactory: (h: DatabaseHandle) => h.db },
    DatabaseContext,
    { provide: UnitOfWork, useExisting: DatabaseContext },
    { provide: Clock, useClass: SystemClock },
    {
      provide: SecretCipher,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new AesGcmCipher(config.fieldEncryptionKey),
    },
    { provide: AuditLogger, useClass: DrizzleAuditLogger },
    { provide: EventPublisher, useClass: OutboxEventPublisher },
    { provide: TenantDirectory, useClass: DrizzleTenantDirectory },
  ],
  exports: [
    DATABASE,
    DatabaseContext,
    UnitOfWork,
    Clock,
    SecretCipher,
    AuditLogger,
    EventPublisher,
    TenantDirectory,
  ],
})
export class SharedModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_HANDLE) private readonly handle: DatabaseHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close();
  }
}
