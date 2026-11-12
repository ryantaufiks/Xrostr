import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/app-config.js';
import { NotificationsService } from './application/notifications.use-cases.js';
import { Notifier } from './application/notifier.js';
import {
  NotificationRepository,
  PushSettings,
  PushSubscriptionRepository,
} from './application/ports.js';
import {
  DrizzleNotificationRepository,
  DrizzlePushSubscriptionRepository,
} from './infrastructure/drizzle-notifications.repositories.js';
import { NotificationsController } from './interface/http/notifications.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [NotificationsController],
  providers: [
    { provide: NotificationRepository, useClass: DrizzleNotificationRepository },
    { provide: PushSubscriptionRepository, useClass: DrizzlePushSubscriptionRepository },
    {
      provide: PushSettings,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): PushSettings => ({ vapidPublicKey: c.vapidPublicKey }),
    },
    Notifier,
    NotificationsService,
  ],
  exports: [Notifier],
})
export class NotificationsModule {}
