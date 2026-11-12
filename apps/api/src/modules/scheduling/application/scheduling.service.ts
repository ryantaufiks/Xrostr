import { Injectable } from '@nestjs/common';
import type {
  CreateShiftRequest,
  MyShiftsQuery,
  PublishResult,
  RosterQuery,
  ShiftAttendance,
  ShiftView,
} from '@xrostr/contracts';
import { AuditLogger, UnitOfWork } from '../../../shared/application/ports.js';
import { formatCalendarDate } from '../../../shared/domain/dates.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { Principal } from '../../identity/public-api.js';
import { Notifier } from '../../notifications/public-api.js';
import {
  WorkforceDirectory,
  type WorkforceEmployee,
  type WorkforceLocation,
} from '../../workforce/public-api.js';
import {
  addDays,
  localDaysToUtcRange,
  localToUtc,
  utcToLocal,
} from '../../../shared/domain/local-time.js';
import { SchedulingErrors } from '../domain/scheduling-errors.js';
import { AttendanceRepository, ShiftRepository, type Shift } from './ports.js';

const MAX_RANGE_DAYS = 62;
const tenantOf = (actor: Principal) => actor.subject.tenantId!;
const dayCount = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
/**
 * Rosters per site. Planners build drafts; publishing makes them visible to officers and
 * notifies each one. Officers only ever see published shifts.
 */
@Injectable()
export class SchedulingService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly shifts: ShiftRepository,
    private readonly attendance: AttendanceRepository,
    private readonly workforce: WorkforceDirectory,
    private readonly notifier: Notifier,
    private readonly audit: AuditLogger,
  ) {}

  roster(actor: Principal, query: RosterQuery): Promise<Result<ShiftView[]>> {
    if (dayCount(query.from, query.to) > MAX_RANGE_DAYS)
      return Promise.resolve(err(SchedulingErrors.rangeTooLong()));
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const location = await this.workforce.location(query.locationId);
      if (!location) return err(SchedulingErrors.locationNotFound());
      const range = localDaysToUtcRange(query.from, query.to, location.timezone);
      const shifts = await this.shifts.forLocation(location.id, range.start, range.end);
      return ok(await this.views(shifts));
    });
  }

  create(actor: Principal, input: CreateShiftRequest): Promise<Result<ShiftView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const location = await this.workforce.location(input.locationId);
      if (!location) return err(SchedulingErrors.locationNotFound());
      if (location.status !== 'active') return err(SchedulingErrors.locationArchived());
      const employee = await this.workforce.employee(input.employeeId);
      if (!employee) return err(SchedulingErrors.employeeNotFound());
      if (employee.status !== 'active') return err(SchedulingErrors.employeeInactive());
      if (employee.legalEntityId !== location.legalEntityId)
        return err(SchedulingErrors.employeeOtherEntity());

      const startsAt = localToUtc(input.date, input.startTime, location.timezone);
      const endsAt = new Date(startsAt.getTime() + input.durationHours * 3_600_000);
      if (await this.shifts.overlaps(employee.id, startsAt, endsAt))
        return err(SchedulingErrors.shiftOverlap());

      const id = await this.shifts.insert({
        locationId: location.id,
        employeeId: employee.id,
        kind: input.kind,
        startsAt,
        endsAt,
        notes: input.notes?.trim() || null,
        createdBy: actor.subject.id,
      });
      if (!id) return err(SchedulingErrors.shiftOverlap());
      const [view] = await this.views([(await this.shifts.findById(id))!]);
      return ok(view!);
    });
  }

  /** Drafts are deleted; published shifts are cancelled and the officer is told. */
  remove(actor: Principal, id: string): Promise<Result<void>> {
    const tenantId = tenantOf(actor);
    return this.uow.runInTenant(tenantId, async () => {
      const shift = await this.shifts.findById(id);
      if (!shift) return err(SchedulingErrors.shiftNotFound());
      if (shift.status === 'cancelled') return err(SchedulingErrors.shiftAlreadyCancelled());
      if (shift.status === 'draft') {
        await this.shifts.remove(id);
        return ok(undefined);
      }

      await this.shifts.cancel(id);
      const [view] = await this.views([shift]);
      const employee = await this.workforce.employee(shift.employeeId);
      if (employee && view) {
        await this.notifier.notify(tenantId, {
          userId: employee.userId,
          kind: 'schedule.cancelled',
          text: {
            en: {
              title: 'Shift cancelled',
              body: `${formatCalendarDate(view.localDate, 'en')}, ${view.localStart}–${view.localEnd} at ${view.location.name}.`,
            },
            id: {
              title: 'Shift dibatalkan',
              body: `${formatCalendarDate(view.localDate, 'id')}, ${view.localStart}–${view.localEnd} di ${view.location.name}.`,
            },
          },
          url: '/tenant',
        });
      }
      await this.record(actor, 'shift.cancelled', id, { employeeId: shift.employeeId });
      return ok(undefined);
    });
  }

  publish(actor: Principal, query: RosterQuery): Promise<Result<PublishResult>> {
    if (dayCount(query.from, query.to) > MAX_RANGE_DAYS)
      return Promise.resolve(err(SchedulingErrors.rangeTooLong()));
    const tenantId = tenantOf(actor);
    return this.uow.runInTenant(tenantId, async () => {
      const location = await this.workforce.location(query.locationId);
      if (!location) return err(SchedulingErrors.locationNotFound());
      const range = localDaysToUtcRange(query.from, query.to, location.timezone);
      const published = await this.shifts.publishDrafts(
        location.id,
        range.start,
        range.end,
        new Date(),
      );

      // One message per officer, not one per shift.
      const byEmployee = Map.groupBy(published, (s) => s.employeeId);
      const employees = await this.workforce.employeesById([...byEmployee.keys()]);
      for (const [employeeId, theirs] of byEmployee) {
        const employee = employees.get(employeeId);
        if (!employee) continue;
        const first = theirs.reduce((a, b) => (a.startsAt < b.startsAt ? a : b));
        const firstDay = utcToLocal(first.startsAt, location.timezone).date;
        await this.notifier.notify(tenantId, {
          userId: employee.userId,
          kind: 'schedule.published',
          text: {
            en: {
              title: 'New schedule published',
              body: `${theirs.length} ${theirs.length === 1 ? 'shift' : 'shifts'} at ${location.name}, from ${formatCalendarDate(firstDay, 'en')}.`,
            },
            id: {
              title: 'Jadwal baru terbit',
              body: `${theirs.length} shift di ${location.name}, mulai ${formatCalendarDate(firstDay, 'id')}.`,
            },
          },
          url: '/tenant',
        });
      }
      await this.record(actor, 'schedule.published', location.id, {
        from: query.from,
        to: query.to,
        shifts: published.length,
      });
      return ok({ published: published.length, notified: byEmployee.size });
    });
  }

  /** The caller's own published shifts, for the officer home screen. */
  myShifts(actor: Principal, query: MyShiftsQuery): Promise<Result<ShiftView[]>> {
    if (dayCount(query.from, query.to) > MAX_RANGE_DAYS)
      return Promise.resolve(err(SchedulingErrors.rangeTooLong()));
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const me = await this.workforce.employeeOfUser(actor.subject.id);
      if (!me) return err(SchedulingErrors.notAnEmployee());
      // Sites may sit in different zones; take a day of slack and filter by local date.
      const start = localToUtc(addDays(query.from, -1), '00:00', 'UTC');
      const end = localToUtc(addDays(query.to, 2), '00:00', 'UTC');
      const shifts = await this.shifts.publishedForEmployee(me.id, start, end);
      const views = await this.views(shifts);
      return ok(views.filter((v) => v.localDate >= query.from && v.localDate <= query.to));
    });
  }

  private async views(shifts: Shift[]): Promise<ShiftView[]> {
    const [employees, locations, attendance] = await Promise.all([
      this.workforce.employeesById(shifts.map((s) => s.employeeId)),
      this.workforce.locationsById(shifts.map((s) => s.locationId)),
      this.attendance.forShifts(shifts.map((s) => s.id)),
    ]);
    return shifts
      .map((s) =>
        toView(s, employees.get(s.employeeId), locations.get(s.locationId), attendance.get(s.id)),
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  private record(actor: Principal, action: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.recordTenant({
      actorType: 'user',
      actorId: actor.subject.id,
      action,
      targetType: action.startsWith('shift') ? 'shift' : 'location',
      targetId: id,
      metadata,
    });
  }
}

function toView(
  shift: Shift,
  employee?: WorkforceEmployee,
  location?: WorkforceLocation,
  attendance?: ShiftAttendance,
): ShiftView {
  const timezone = location?.timezone ?? 'UTC';
  const start = utcToLocal(shift.startsAt, timezone);
  const end = utcToLocal(shift.endsAt, timezone);
  return {
    id: shift.id,
    kind: shift.kind,
    status: shift.status,
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
    localDate: start.date,
    localStart: start.time,
    localEnd: end.time,
    timezone,
    notes: shift.notes,
    location: { id: shift.locationId, name: location?.name ?? '' },
    employee: {
      id: shift.employeeId,
      fullName: employee?.fullName ?? '',
      employeeNo: employee?.employeeNo ?? '',
    },
    attendance: attendance ?? null,
  };
}
