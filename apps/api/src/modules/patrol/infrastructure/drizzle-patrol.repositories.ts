import { Injectable } from '@nestjs/common';
import type { PatrolRoundStatus, PatrolStatus } from '@xrostr/contracts';
import { patrolCheckpoints, patrolRounds, patrolRoutes, patrolScans } from '@xrostr/db';
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import {
  causeCode,
  PG_UNIQUE_VIOLATION,
} from '../../../shared/infrastructure/database/pg-errors.js';
import {
  PatrolRoundRepository,
  PatrolRouteRepository,
  type CheckpointChanges,
  type NewCheckpoint,
  type NewPatrolScan,
  type PatrolCheckpoint,
  type PatrolRound,
  type PatrolRoute,
  type PatrolScan,
} from '../application/ports.js';

const toRoute = (r: typeof patrolRoutes.$inferSelect): PatrolRoute => ({
  id: r.id,
  locationId: r.locationId,
  name: r.name,
  intervalMinutes: r.intervalMinutes,
  status: r.status as PatrolStatus,
});

const toCheckpoint = (r: typeof patrolCheckpoints.$inferSelect): PatrolCheckpoint => ({
  id: r.id,
  routeId: r.routeId,
  name: r.name,
  position: r.position,
  tagSecret: r.tagSecret,
  latitude: r.latitude,
  longitude: r.longitude,
  radiusM: r.radiusM,
  status: r.status as PatrolStatus,
});

const toRound = (r: typeof patrolRounds.$inferSelect): PatrolRound => ({
  id: r.id,
  routeId: r.routeId,
  employeeId: r.employeeId,
  shiftId: r.shiftId,
  status: r.status as PatrolRoundStatus,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
  checkpointCount: r.checkpointCount,
});

@Injectable()
export class DrizzlePatrolRouteRepository extends PatrolRouteRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async forLocation(locationId: string): Promise<PatrolRoute[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(patrolRoutes)
      .where(eq(patrolRoutes.locationId, locationId))
      .orderBy(asc(patrolRoutes.name));
    return rows.map(toRoute);
  }

  async findById(id: string): Promise<PatrolRoute | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(patrolRoutes)
      .where(eq(patrolRoutes.id, id))
      .limit(1);
    return row ? toRoute(row) : null;
  }

  async insert(route: Omit<PatrolRoute, 'id' | 'status'>): Promise<string | null> {
    const [row] = await this.ctx
      .executor()
      .insert(patrolRoutes)
      .values({ ...route, tenantId: this.ctx.tenantId() })
      .onConflictDoNothing()
      .returning({ id: patrolRoutes.id });
    return row?.id ?? null;
  }

  async update(
    id: string,
    changes: Partial<Pick<PatrolRoute, 'name' | 'intervalMinutes' | 'status'>>,
  ): Promise<boolean> {
    try {
      // Savepoint: a taken name must not abort the surrounding transaction.
      await this.ctx.executor().transaction(async (tx) => {
        await tx
          .update(patrolRoutes)
          .set({ ...changes, version: sql`${patrolRoutes.version} + 1` })
          .where(eq(patrolRoutes.id, id));
      });
      return true;
    } catch (error) {
      if (causeCode(error) === PG_UNIQUE_VIOLATION) return false;
      throw error;
    }
  }

  async checkpoints(routeIds: readonly string[]): Promise<PatrolCheckpoint[]> {
    if (routeIds.length === 0) return [];
    const rows = await this.ctx
      .executor()
      .select()
      .from(patrolCheckpoints)
      .where(inArray(patrolCheckpoints.routeId, [...routeIds]))
      .orderBy(asc(patrolCheckpoints.position), asc(patrolCheckpoints.createdAt));
    return rows.map(toCheckpoint);
  }

  async findCheckpoint(id: string): Promise<PatrolCheckpoint | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(patrolCheckpoints)
      .where(eq(patrolCheckpoints.id, id))
      .limit(1);
    return row ? toCheckpoint(row) : null;
  }

  async checkpointByTag(tagSecret: string): Promise<PatrolCheckpoint | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(patrolCheckpoints)
      .where(eq(patrolCheckpoints.tagSecret, tagSecret))
      .limit(1);
    return row ? toCheckpoint(row) : null;
  }

  async insertCheckpoint(checkpoint: NewCheckpoint): Promise<string> {
    const [row] = await this.ctx
      .executor()
      .insert(patrolCheckpoints)
      .values({ ...checkpoint, tenantId: this.ctx.tenantId() })
      .returning({ id: patrolCheckpoints.id });
    return row!.id;
  }

  async updateCheckpoint(id: string, changes: CheckpointChanges): Promise<void> {
    await this.ctx
      .executor()
      .update(patrolCheckpoints)
      .set(changes)
      .where(eq(patrolCheckpoints.id, id));
  }

  async setPositions(positions: readonly { id: string; position: number }[]): Promise<void> {
    const db = this.ctx.executor();
    for (const { id, position } of positions) {
      await db.update(patrolCheckpoints).set({ position }).where(eq(patrolCheckpoints.id, id));
    }
  }

  async setTagSecret(id: string, secret: string): Promise<void> {
    await this.ctx
      .executor()
      .update(patrolCheckpoints)
      .set({ tagSecret: secret })
      .where(eq(patrolCheckpoints.id, id));
  }
}

@Injectable()
export class DrizzlePatrolRoundRepository extends PatrolRoundRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async findById(id: string): Promise<PatrolRound | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(patrolRounds)
      .where(eq(patrolRounds.id, id))
      .limit(1);
    return row ? toRound(row) : null;
  }

  async openRound(routeId: string, employeeId: string): Promise<PatrolRound | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(patrolRounds)
      .where(
        and(
          eq(patrolRounds.routeId, routeId),
          eq(patrolRounds.employeeId, employeeId),
          eq(patrolRounds.status, 'in_progress'),
        ),
      )
      .limit(1);
    return row ? toRound(row) : null;
  }

  async start(round: Omit<PatrolRound, 'id' | 'status' | 'finishedAt'>): Promise<string | null> {
    const [row] = await this.ctx
      .executor()
      .insert(patrolRounds)
      .values({ ...round, tenantId: this.ctx.tenantId() })
      .onConflictDoNothing()
      .returning({ id: patrolRounds.id });
    return row?.id ?? null;
  }

  async finish(id: string, status: PatrolRoundStatus, at: Date): Promise<void> {
    await this.ctx
      .executor()
      .update(patrolRounds)
      .set({ status, finishedAt: at })
      .where(and(eq(patrolRounds.id, id), eq(patrolRounds.status, 'in_progress')));
  }

  async addScan(scan: NewPatrolScan): Promise<boolean> {
    const rows = await this.ctx
      .executor()
      .insert(patrolScans)
      .values({ ...scan, tenantId: this.ctx.tenantId() })
      .onConflictDoNothing()
      .returning({ id: patrolScans.id });
    return rows.length > 0;
  }

  async scans(roundIds: readonly string[]): Promise<PatrolScan[]> {
    if (roundIds.length === 0) return [];
    const rows = await this.ctx
      .executor()
      .select({
        roundId: patrolScans.roundId,
        checkpointId: patrolScans.checkpointId,
        scannedAt: patrolScans.scannedAt,
        distanceM: patrolScans.distanceM,
        locationVerified: patrolScans.locationVerified,
      })
      .from(patrolScans)
      .where(inArray(patrolScans.roundId, [...roundIds]))
      .orderBy(asc(patrolScans.scannedAt));
    return rows;
  }

  async forRoutes(routeIds: readonly string[], start: Date, end: Date): Promise<PatrolRound[]> {
    if (routeIds.length === 0) return [];
    const rows = await this.ctx
      .executor()
      .select()
      .from(patrolRounds)
      .where(
        and(
          inArray(patrolRounds.routeId, [...routeIds]),
          gte(patrolRounds.startedAt, start),
          lt(patrolRounds.startedAt, end),
        ),
      )
      .orderBy(desc(patrolRounds.startedAt))
      .limit(500);
    return rows.map(toRound);
  }

  async lastFinished(employeeId: string, shiftId: string): Promise<Map<string, Date>> {
    const rows = await this.ctx
      .executor()
      .select({
        routeId: patrolRounds.routeId,
        at: sql<Date>`max(${patrolRounds.finishedAt})`.mapWith((v: string) => new Date(v)),
      })
      .from(patrolRounds)
      .where(
        and(
          eq(patrolRounds.employeeId, employeeId),
          eq(patrolRounds.shiftId, shiftId),
          isNotNull(patrolRounds.finishedAt),
        ),
      )
      .groupBy(patrolRounds.routeId);
    return new Map(rows.map((r) => [r.routeId, r.at]));
  }
}
