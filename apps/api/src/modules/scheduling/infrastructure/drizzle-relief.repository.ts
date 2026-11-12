import { Injectable } from '@nestjs/common';
import type { ReliefOfferStatus, ReliefStatus } from '@xrostr/contracts';
import { reliefOffers, reliefRequests } from '@xrostr/db';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import { ReliefRepository, type ReliefOffer, type ReliefRequest } from '../application/ports.js';

const toRequest = (r: typeof reliefRequests.$inferSelect): ReliefRequest => ({
  id: r.id,
  shiftId: r.shiftId,
  locationId: r.locationId,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  requestedBy: r.requestedBy,
  status: r.status as ReliefStatus,
  timeoutMinutes: r.timeoutMinutes,
  filledEmployeeId: r.filledEmployeeId,
  newShiftId: r.newShiftId,
  createdAt: r.createdAt,
});

const toOffer = (r: typeof reliefOffers.$inferSelect): ReliefOffer => ({
  id: r.id,
  requestId: r.requestId,
  employeeId: r.employeeId,
  position: r.position,
  status: r.status as ReliefOfferStatus,
  offeredAt: r.offeredAt,
  expiresAt: r.expiresAt,
});

@Injectable()
export class DrizzleReliefRepository extends ReliefRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async insertRequest(
    request: Pick<
      ReliefRequest,
      'shiftId' | 'locationId' | 'startsAt' | 'endsAt' | 'requestedBy' | 'timeoutMinutes'
    >,
  ): Promise<string | null> {
    const [row] = await this.ctx
      .executor()
      .insert(reliefRequests)
      .values({ ...request, tenantId: this.ctx.tenantId() })
      // The partial unique index allows one open search per shift.
      .onConflictDoNothing()
      .returning({ id: reliefRequests.id });
    return row?.id ?? null;
  }

  async insertOffers(requestId: string, employeeIds: readonly string[]): Promise<void> {
    await this.ctx
      .executor()
      .insert(reliefOffers)
      .values(
        employeeIds.map((employeeId, i) => ({
          tenantId: this.ctx.tenantId(),
          requestId,
          employeeId,
          position: i + 1,
        })),
      );
  }

  async findRequest(id: string): Promise<ReliefRequest | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(reliefRequests)
      .where(eq(reliefRequests.id, id))
      .limit(1);
    return row ? toRequest(row) : null;
  }

  async lockRequest(id: string): Promise<ReliefRequest | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(reliefRequests)
      .where(eq(reliefRequests.id, id))
      .limit(1)
      .for('update');
    return row ? toRequest(row) : null;
  }

  async list(filter: { locationId?: string; openOnly: boolean }): Promise<ReliefRequest[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(reliefRequests)
      .where(
        and(
          filter.locationId ? eq(reliefRequests.locationId, filter.locationId) : undefined,
          filter.openOnly ? eq(reliefRequests.status, 'open') : undefined,
        ),
      )
      .orderBy(desc(reliefRequests.createdAt))
      .limit(200);
    return rows.map(toRequest);
  }

  async offers(requestIds: readonly string[]): Promise<ReliefOffer[]> {
    if (requestIds.length === 0) return [];
    const rows = await this.ctx
      .executor()
      .select()
      .from(reliefOffers)
      .where(inArray(reliefOffers.requestId, [...requestIds]))
      .orderBy(asc(reliefOffers.position));
    return rows.map(toOffer);
  }

  async findOffer(id: string): Promise<ReliefOffer | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(reliefOffers)
      .where(eq(reliefOffers.id, id))
      .limit(1);
    return row ? toOffer(row) : null;
  }

  async pendingFor(employeeId: string, at: Date): Promise<ReliefOffer[]> {
    const rows = await this.ctx
      .executor()
      .select({ offer: reliefOffers })
      .from(reliefOffers)
      .innerJoin(reliefRequests, eq(reliefRequests.id, reliefOffers.requestId))
      .where(
        and(
          eq(reliefOffers.employeeId, employeeId),
          eq(reliefOffers.status, 'offered'),
          gt(reliefOffers.expiresAt, at),
          eq(reliefRequests.status, 'open'),
        ),
      )
      .orderBy(asc(reliefOffers.expiresAt));
    return rows.map((r) => toOffer(r.offer));
  }

  async setOfferStatus(id: string, status: ReliefOfferStatus, at: Date): Promise<void> {
    await this.ctx
      .executor()
      .update(reliefOffers)
      .set({ status, respondedAt: at })
      .where(eq(reliefOffers.id, id));
  }

  async offerNext(requestId: string, at: Date, expiresAt: Date): Promise<ReliefOffer | null> {
    const rows = await this.ctx
      .executor()
      .update(reliefOffers)
      .set({ status: 'offered', offeredAt: at, expiresAt })
      .where(
        eq(
          reliefOffers.id,
          sql`(select id from relief_offers
               where request_id = ${requestId} and status = 'queued'
               order by position limit 1)`,
        ),
      )
      .returning();
    return rows[0] ? toOffer(rows[0]) : null;
  }

  async withdrawRemaining(requestId: string, at: Date): Promise<void> {
    await this.ctx
      .executor()
      .update(reliefOffers)
      .set({ status: 'withdrawn', respondedAt: at })
      .where(
        and(
          eq(reliefOffers.requestId, requestId),
          inArray(reliefOffers.status, ['queued', 'offered']),
        ),
      );
  }

  async close(
    id: string,
    status: Exclude<ReliefStatus, 'open'>,
    at: Date,
    filled?: { employeeId: string; shiftId: string },
  ): Promise<void> {
    await this.ctx
      .executor()
      .update(reliefRequests)
      .set({
        status,
        closedAt: at,
        ...(filled && { filledEmployeeId: filled.employeeId, newShiftId: filled.shiftId }),
      })
      .where(eq(reliefRequests.id, id));
  }
}
