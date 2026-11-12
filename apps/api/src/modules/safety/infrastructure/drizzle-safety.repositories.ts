import { Injectable } from '@nestjs/common';
import type { AlertKind, AlertStatus } from '@xrostr/contracts';
import { alerts, welfareChecks } from '@xrostr/db';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import {
  AlertRepository,
  WelfareCheckRepository,
  type Alert,
  type NewAlert,
  type WelfareCheck,
} from '../application/ports.js';

const toAlert = (r: typeof alerts.$inferSelect): Alert => ({
  id: r.id,
  kind: r.kind as AlertKind,
  status: r.status as AlertStatus,
  employeeId: r.employeeId,
  locationId: r.locationId,
  shiftId: r.shiftId,
  routeId: r.routeId,
  welfareCheckId: r.welfareCheckId,
  latitude: r.latitude,
  longitude: r.longitude,
  accuracyM: r.accuracyM,
  note: r.note,
  raisedAt: r.raisedAt,
  acknowledgedBy: r.acknowledgedBy,
  acknowledgedAt: r.acknowledgedAt,
  resolvedAt: r.resolvedAt,
});

const toCheck = (r: typeof welfareChecks.$inferSelect): WelfareCheck => ({
  id: r.id,
  employeeId: r.employeeId,
  locationId: r.locationId,
  promptedAt: r.promptedAt,
  respondBy: r.respondBy,
  respondedAt: r.respondedAt,
  escalatedAt: r.escalatedAt,
});

@Injectable()
export class DrizzleAlertRepository extends AlertRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async insert(alert: NewAlert): Promise<string> {
    const [row] = await this.ctx
      .executor()
      .insert(alerts)
      .values({ ...alert, tenantId: this.ctx.tenantId() })
      .returning({ id: alerts.id });
    return row!.id;
  }

  async findById(id: string): Promise<Alert | null> {
    const [row] = await this.ctx.executor().select().from(alerts).where(eq(alerts.id, id)).limit(1);
    return row ? toAlert(row) : null;
  }

  async list(unresolvedOnly: boolean): Promise<Alert[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(alerts)
      .where(unresolvedOnly ? ne(alerts.status, 'resolved') : undefined)
      .orderBy(desc(alerts.raisedAt))
      .limit(200);
    return rows.map(toAlert);
  }

  async latestUnresolvedSos(employeeId: string): Promise<Alert | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(alerts)
      .where(
        and(
          eq(alerts.employeeId, employeeId),
          eq(alerts.kind, 'sos'),
          ne(alerts.status, 'resolved'),
        ),
      )
      .orderBy(desc(alerts.raisedAt))
      .limit(1);
    return row ? toAlert(row) : null;
  }

  async acknowledge(id: string, by: string, at: Date): Promise<void> {
    await this.ctx
      .executor()
      .update(alerts)
      .set({ status: 'acknowledged', acknowledgedBy: by, acknowledgedAt: at })
      .where(and(eq(alerts.id, id), eq(alerts.status, 'open')));
  }

  async resolve(id: string, by: string | null, at: Date, note?: string): Promise<void> {
    await this.ctx
      .executor()
      .update(alerts)
      .set({ status: 'resolved', resolvedBy: by, resolvedAt: at, ...(note && { note }) })
      .where(and(eq(alerts.id, id), ne(alerts.status, 'resolved')));
  }

  async resolveForWelfareCheck(checkId: string, at: Date): Promise<boolean> {
    const rows = await this.ctx
      .executor()
      .update(alerts)
      .set({ status: 'resolved', resolvedAt: at })
      .where(and(eq(alerts.welfareCheckId, checkId), ne(alerts.status, 'resolved')))
      .returning({ id: alerts.id });
    return rows.length > 0;
  }
}

@Injectable()
export class DrizzleWelfareCheckRepository extends WelfareCheckRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async findById(id: string): Promise<WelfareCheck | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(welfareChecks)
      .where(eq(welfareChecks.id, id))
      .limit(1);
    return row ? toCheck(row) : null;
  }

  async pendingFor(employeeId: string): Promise<WelfareCheck | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(welfareChecks)
      .where(and(eq(welfareChecks.employeeId, employeeId), isNull(welfareChecks.respondedAt)))
      .orderBy(desc(welfareChecks.promptedAt))
      .limit(1);
    return row ? toCheck(row) : null;
  }

  async respond(
    id: string,
    at: Date,
    position: { latitude: number; longitude: number } | null,
  ): Promise<void> {
    await this.ctx
      .executor()
      .update(welfareChecks)
      .set({ respondedAt: at, ...position })
      .where(and(eq(welfareChecks.id, id), isNull(welfareChecks.respondedAt)));
  }
}
