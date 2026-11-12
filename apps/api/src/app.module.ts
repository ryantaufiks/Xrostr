import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './modules/audit/audit.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { TenancyModule } from './modules/tenancy/tenancy.module.js';
import { WorkforceModule } from './modules/workforce/workforce.module.js';
import { APP_CONFIG, type AppConfig } from './shared/config/app-config.js';
import { HealthController } from './health.controller.js';
import { ProblemDetailsFilter } from './shared/interface/http/problem-details.filter.js';
import { SharedModule } from './shared/shared.module.js';

/** Composition root. Config is passed in so tests can supply their own. */
@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level:
              config.env === 'production' ? 'info' : config.env === 'test' ? 'silent' : 'debug',
            redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
            ...(config.env === 'development' && { transport: { target: 'pino-pretty' } }),
          },
        }),
        // 120 requests per minute per client by default; auth routes are stricter.
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
          skipIf: () => !config.rateLimitEnabled,
        }),
        SharedModule,
        IdentityModule,
        TenancyModule,
        AuditModule,
        NotificationsModule,
        WorkforceModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      ],
      exports: [APP_CONFIG],
    };
  }
}
