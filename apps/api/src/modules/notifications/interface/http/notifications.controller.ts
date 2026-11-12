import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  pushSubscriptionSchema,
  unsubscribePushSchema,
  type NotificationInbox,
  type PushSubscriptionRequest,
  type UnsubscribePushRequest,
} from '@xrostr/contracts';
import {
  Client,
  type ClientInfo,
} from '../../../../shared/interface/http/client-info.decorator.js';
import { ZodValidationPipe } from '../../../../shared/interface/http/zod-validation.pipe.js';
import { CurrentPrincipal, TenantUser, type Principal } from '../../../identity/public-api.js';
import { NotificationsService, type Recipient } from '../../application/notifications.use-cases.js';
import { PushSettings } from '../../application/ports.js';

// TenantUser admits tenant users only, so tenantId is always present.
const recipient = (p: Principal): Recipient => ({
  tenantId: p.subject.tenantId!,
  userId: p.subject.id,
});

@TenantUser()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly push: PushSettings,
  ) {}

  @Get()
  inbox(@CurrentPrincipal() principal: Principal): Promise<NotificationInbox> {
    return this.service.inbox(recipient(principal));
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.service.markAllRead(recipient(principal));
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.markRead(recipient(principal), id);
  }

  @Get('push/public-key')
  publicKey(): { publicKey: string | null } {
    return { publicKey: this.push.vapidPublicKey };
  }

  @Post('push/subscriptions')
  @HttpCode(204)
  async subscribe(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(pushSubscriptionSchema)) body: PushSubscriptionRequest,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.service.subscribe(recipient(principal), body, client.userAgent);
  }

  @Delete('push/subscriptions')
  @HttpCode(204)
  async unsubscribe(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(unsubscribePushSchema)) body: UnsubscribePushRequest,
  ): Promise<void> {
    await this.service.unsubscribe(recipient(principal), body.endpoint);
  }

  @Post('test')
  @HttpCode(204)
  async test(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.service.sendTest(recipient(principal));
  }
}
