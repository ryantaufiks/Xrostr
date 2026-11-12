import { Injectable } from '@nestjs/common';
import type {
  AlertView,
  MySafety,
  RaiseSosRequest,
  RespondWelfareRequest,
} from '@xrostr/contracts';
import { AuditLogger, Clock, UnitOfWork } from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import { TenantUserAccess, type Principal } from '../../identity/public-api.js';
import { Notifier, type NotificationMessage } from '../../notifications/public-api.js';
import { PatrolDirectory } from '../../patrol/public-api.js';
import { SchedulingDirectory } from '../../scheduling/public-api.js';
import { WorkforceDirectory, type WorkforceEmployee } from '../../workforce/public-api.js';
import { SafetyErrors } from '../domain/safety-errors.js';
import { AlertRepository, WelfareCheckRepository, type Alert } from './ports.js';

const tenantOf = (actor: Principal) => actor.subject.tenantId!;
/** An SOS raised just before or after a shift still belongs to that shift's site. */
const SHIFT_GRACE_MS = 60 * 60_000;

/**
 * Officer safety: an SOS button, answers to the worker's "are you OK?" checks, and the alert
 * list where supervisors acknowledge and resolve SOS calls, unanswered checks and late patrols.
 * Everyone with `alerts.respond` is told the moment an SOS is raised.
 */
@Injectable()
export class SafetyService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly alerts: AlertRepository,
    private readonly checks: WelfareCheckRepository,
    private readonly workforce: WorkforceDirectory,
    private readonly scheduling: SchedulingDirectory,
    private readonly patrol: PatrolDirectory,
    private readonly users: TenantUserAccess,
    private readonly notifier: Notifier,
    private readonly audit: AuditLogger,
    private readonly clock: Clock,
  ) {}

  raiseSos(actor: Principal, input: RaiseSosRequest): Promise<Result<AlertView>> {
    const tenantId = tenantOf(actor);
    return this.uow.runInTenant(tenantId, async () => {
      const me = await this.workforce.employeeOfUser(actor.subject.id);
      if (!me) return err(SafetyErrors.notAnEmployee());
      const now = this.clock.now();
      const shift = await this.scheduling.runningShift(me.id, now, SHIFT_GRACE_MS);
      const locationId = shift?.locationId ?? me.locationId;
      const site = locationId ? await this.workforce.location(locationId) : null;
      const id = await this.alerts.insert({
        kind: 'sos',
        employeeId: me.id,
        locationId: site?.id ?? null,
        shiftId: shift?.id ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracyM: input.accuracy != null ? Math.round(input.accuracy) : null,
        note: input.note?.trim() || null,
        raisedAt: now,
      });
      const where = site?.name ?? '';
      await this.tellResponders(tenantId, actor.subject.id, {
        kind: 'alert.sos',
        url: '/tenant/alerts',
        text: {
          en: {
            title: `SOS: ${me.fullName}`,
            body: `${where ? `${where}. ` : ''}Open to see their location and respond.`,
          },
          id: {
            title: `SOS: ${me.fullName}`,
            body: `${where ? `${where}. ` : ''}Buka untuk melihat lokasi dan menanggapi.`,
          },
        },
      });
      await this.record(actor, 'alert.sos_raised', id, { employeeId: me.id });
      return ok((await this.views([(await this.alerts.findById(id))!]))[0]!);
    });
  }

  mine(actor: Principal): Promise<Result<MySafety>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const me = await this.workforce.employeeOfUser(actor.subject.id);
      if (!me) return err(SafetyErrors.notAnEmployee());
      const [check, sos] = await Promise.all([
        this.checks.pendingFor(me.id),
        this.alerts.latestUnresolvedSos(me.id),
      ]);
      return ok({
        check: check && {
          id: check.id,
          promptedAt: check.promptedAt.toISOString(),
          respondBy: check.respondBy.toISOString(),
          respondedAt: null,
        },
        sos: sos ? (await this.views([sos]))[0]! : null,
      });
    });
  }

  /** "I am OK". A late answer also closes the alert it raised and tells supervisors. */
  respondWelfare(
    actor: Principal,
    id: string,
    input: RespondWelfareRequest,
  ): Promise<Result<void>> {
    const tenantId = tenantOf(actor);
    return this.uow.runInTenant(tenantId, async () => {
      const me = await this.workforce.employeeOfUser(actor.subject.id);
      const check = await this.checks.findById(id);
      if (!me || !check || check.employeeId !== me.id) return err(SafetyErrors.checkNotFound());
      if (check.respondedAt) return ok(undefined);
      const now = this.clock.now();
      await this.checks.respond(
        id,
        now,
        input.latitude != null ? { latitude: input.latitude, longitude: input.longitude! } : null,
      );
      if (await this.alerts.resolveForWelfareCheck(id, now)) {
        await this.tellResponders(tenantId, actor.subject.id, {
          kind: 'alert.welfare_answered',
          url: '/tenant/alerts',
          text: {
            en: { title: `${me.fullName} is OK`, body: 'They answered the welfare check late.' },
            id: { title: `${me.fullName} aman`, body: 'Cek keselamatan dijawab terlambat.' },
          },
        });
      }
      return ok(undefined);
    });
  }

  list(actor: Principal, unresolvedOnly: boolean): Promise<AlertView[]> {
    return this.uow.runInTenant(tenantOf(actor), async () =>
      this.views(await this.alerts.list(unresolvedOnly)),
    );
  }

  /** A supervisor takes the alert on; for an SOS, the officer is told help is responding. */
  acknowledge(actor: Principal, id: string): Promise<Result<AlertView>> {
    const tenantId = tenantOf(actor);
    return this.uow.runInTenant(tenantId, async () => {
      const alert = await this.alerts.findById(id);
      if (!alert) return err(SafetyErrors.alertNotFound());
      if (alert.status === 'resolved') return err(SafetyErrors.alertResolved());
      if (alert.status === 'open') {
        await this.alerts.acknowledge(id, actor.subject.id, this.clock.now());
        const employee = await this.workforce.employee(alert.employeeId);
        if (alert.kind === 'sos' && employee) {
          await this.notifier.notify(tenantId, {
            userId: employee.userId,
            kind: 'alert.sos_acknowledged',
            url: '/tenant/patrol',
            text: {
              en: {
                title: 'Your SOS was received',
                body: 'A supervisor is responding. Stay safe and keep your phone with you.',
              },
              id: {
                title: 'SOS Anda diterima',
                body: 'Supervisor sedang menanggapi. Tetap waspada dan bawa HP Anda.',
              },
            },
          });
        }
        await this.record(actor, 'alert.acknowledged', id, { kind: alert.kind });
      }
      return ok((await this.views([(await this.alerts.findById(id))!]))[0]!);
    });
  }

  resolve(actor: Principal, id: string, note?: string): Promise<Result<AlertView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const alert = await this.alerts.findById(id);
      if (!alert) return err(SafetyErrors.alertNotFound());
      if (alert.status === 'resolved') return err(SafetyErrors.alertResolved());
      await this.alerts.resolve(id, actor.subject.id, this.clock.now(), note?.trim() || undefined);
      await this.record(actor, 'alert.resolved', id, { kind: alert.kind });
      return ok((await this.views([(await this.alerts.findById(id))!]))[0]!);
    });
  }

  private async tellResponders(
    tenantId: string,
    raisedBy: string,
    message: Omit<NotificationMessage, 'userId'>,
  ) {
    const responders = (await this.users.usersWithPermission('alerts.respond')).filter(
      (u) => u !== raisedBy,
    );
    for (const userId of responders) await this.notifier.notify(tenantId, { ...message, userId });
  }

  private async views(list: Alert[]): Promise<AlertView[]> {
    const [employees, locations, routes, ackers] = await Promise.all([
      this.workforce.employeesById(list.map((a) => a.employeeId)),
      this.workforce.locationsById(list.flatMap((a) => (a.locationId ? [a.locationId] : []))),
      this.patrol.routeNames(list.flatMap((a) => (a.routeId ? [a.routeId] : []))),
      this.users.summarize(list.flatMap((a) => (a.acknowledgedBy ? [a.acknowledgedBy] : []))),
    ]);
    return list.map((a) => {
      const employee: WorkforceEmployee | undefined = employees.get(a.employeeId);
      const location = a.locationId ? locations.get(a.locationId) : undefined;
      return {
        id: a.id,
        kind: a.kind,
        status: a.status,
        employee: {
          id: a.employeeId,
          fullName: employee?.fullName ?? '',
          employeeNo: employee?.employeeNo ?? '',
          phone: employee?.phone ?? null,
        },
        location: location
          ? { id: location.id, name: location.name, timezone: location.timezone }
          : null,
        route: a.routeId ? { id: a.routeId, name: routes.get(a.routeId) ?? '' } : null,
        latitude: a.latitude,
        longitude: a.longitude,
        accuracyM: a.accuracyM,
        note: a.note,
        raisedAt: a.raisedAt.toISOString(),
        acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
        acknowledgedBy: a.acknowledgedBy ? (ackers.get(a.acknowledgedBy)?.fullName ?? null) : null,
        resolvedAt: a.resolvedAt?.toISOString() ?? null,
      };
    });
  }

  private record(actor: Principal, action: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.recordTenant({
      actorType: 'user',
      actorId: actor.subject.id,
      action,
      targetType: 'alert',
      targetId: id,
      metadata,
    });
  }
}
