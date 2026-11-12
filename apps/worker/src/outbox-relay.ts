import { outboxEvents, type Database } from '@xrostr/db';
import { and, asc, eq, isNull, lt, lte, sql } from 'drizzle-orm';

export interface OutboxEvent {
  id: string;
  tenantId: string | null;
  type: string;
  payload: unknown;
  occurredAt: Date;
}

/** Handlers must be idempotent: delivery is at-least-once. */
export type EventHandler = (event: OutboxEvent) => Promise<void>;

export interface RelayOptions {
  batchSize: number;
  maxAttempts: number;
}

const MAX_BACKOFF_SECONDS = 3600;

/**
 * Delivers outbox events to their handlers. `FOR UPDATE SKIP LOCKED` lets several
 * worker replicas run side by side without delivering the same event twice at once.
 * A failing event is retried with exponential backoff and parked after `maxAttempts`.
 */
export class OutboxRelay {
  constructor(
    private readonly db: Database,
    private readonly handlers: ReadonlyMap<string, readonly EventHandler[]>,
    private readonly options: RelayOptions = { batchSize: 50, maxAttempts: 10 },
  ) {}

  /** Processes one batch; returns how many events were attempted. */
  tick(): Promise<number> {
    return this.db.transaction(async (tx) => {
      const batch = await tx
        .select()
        .from(outboxEvents)
        .where(
          and(
            isNull(outboxEvents.processedAt),
            lte(outboxEvents.availableAt, sql`now()`),
            lt(outboxEvents.attempts, this.options.maxAttempts),
          ),
        )
        .orderBy(asc(outboxEvents.occurredAt))
        .limit(this.options.batchSize)
        .for('update', { skipLocked: true });

      for (const row of batch) {
        try {
          for (const handle of this.handlers.get(row.type) ?? []) await handle(row);
          await tx
            .update(outboxEvents)
            .set({ processedAt: sql`now()` })
            .where(eq(outboxEvents.id, row.id));
        } catch (error) {
          const attempts = row.attempts + 1;
          const delay = Math.min(2 ** attempts, MAX_BACKOFF_SECONDS);
          await tx
            .update(outboxEvents)
            .set({
              attempts,
              lastError: error instanceof Error ? error.message : String(error),
              availableAt: sql`now() + make_interval(secs => ${delay})`,
            })
            .where(eq(outboxEvents.id, row.id));
        }
      }
      return batch.length;
    });
  }
}
