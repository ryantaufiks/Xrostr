import { Injectable } from '@nestjs/common';
import { outboxEvents } from '@inroster/db';
import { EventPublisher, type DomainEvent } from '../../application/ports.js';
import { DatabaseContext } from '../database/database-context.js';

@Injectable()
export class OutboxEventPublisher extends EventPublisher {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async publish(event: DomainEvent): Promise<void> {
    await this.ctx.executor().insert(outboxEvents).values({
      tenantId: event.tenantId,
      type: event.type,
      payload: event.payload,
    });
  }
}
