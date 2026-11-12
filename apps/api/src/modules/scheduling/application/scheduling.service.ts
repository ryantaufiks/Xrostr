import { Injectable } from '@nestjs/common';
import type {
  BatchShiftsRequest,
  CopyResult,
  CreateShiftRequest,
  MyShiftsQuery,
  PublishResult,
  RosterAuxiliaryView,
  RosterConflictsView,
  RosterQuery,
  SetStaffingRequest,
  ShiftAttendance,
  ShiftView,
  StaffingView,
} from '@xrostr/contracts';
import { WEEKLY_HOUR_LIMITS } from '@xrostr/contracts';
import { AuditLogger, UnitOfWork } from '../../../shared/application/ports.js';
import { formatCalendarDate } from '../../../shared/domain/dates.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
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
import {
  AttendanceRepository,
  LeaveCalendarRepository,
  ShiftRepository,
  StaffingRepository,
  ZoneRepository,
  type Shift,
  type Zone,
} from './ports.js';
import { computeConflicts } from './scheduling-conflicts.js';
import { LegalEntityDirectory } from '../../tenancy/public-api.js';

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
    private readonly staffingRepo: StaffingRepository,
    private readonly leaves: LeaveCalendarRepository,
    private readonly zones: ZoneRepository,
    private readonly workforce: WorkforceDirectory,
    private readonly entities: LegalEntityDirectory,
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

  staffing(actor: Principal, locationId: string): Promise<Result<StaffingView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const location = await this.workforce.location(locationId);
      if (!location) return err(SchedulingErrors.locationNotFound());
      const requirements = await this.staffingRepo.forLocation(location.id);
      return ok({ locationId: location.id, requirements });
    });
  }

  setStaffing(
    actor: Principal,
    locationId: string,
    input: SetStaffingRequest,
  ): Promise<Result<StaffingView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const location = await this.workforce.location(locationId);
      if (!location) return err(SchedulingErrors.locationNotFound());
      await this.staffingRepo.replace(location.id, input.requirements);
      await this.record(actor, 'staffing.updated', location.id, {});
      return ok({ locationId: location.id, requirements: input.requirements });
    });
  }

  create(actor: Principal, input: CreateShiftRequest): Promise<Result<ShiftView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const employee = await this.workforce.employee(input.employeeId);
      if (!employee) return err(SchedulingErrors.employeeNotFound());
      if (employee.status !== 'active') return err(SchedulingErrors.employeeInactive());

      const location = input.locationId
        ? await this.workforce.location(input.locationId)
        : undefined;
      if (input.locationId && !location) return err(SchedulingErrors.locationNotFound());
      if (location && location.status !== 'active') return err(SchedulingErrors.locationArchived());
      if (location && employee.legalEntityId !== location.legalEntityId)
        return err(SchedulingErrors.employeeOtherEntity());

      const zone = input.zoneId ? await this.zones.findById(input.zoneId) : undefined;
      if (input.zoneId && !zone) return err(SchedulingErrors.zoneNotFound());
      if (zone) {
        const member = zone.locations[0] && (await this.workforce.location(zone.locations[0].id));
        if (member && member.legalEntityId !== employee.legalEntityId)
          return err(SchedulingErrors.zoneOtherEntity());
      }

      const timezone = await this.timezoneOf(input, employee);
      const startsAt = localToUtc(input.date, input.startTime, timezone);
      const endsAt = new Date(startsAt.getTime() + input.durationHours * 3_600_000);
      if (await this.shifts.overlaps(employee.id, startsAt, endsAt, input.kind === 'standby'))
        return err(SchedulingErrors.shiftOverlap());

      const id = await this.shifts.insert({
        locationId: input.locationId ?? null,
        zoneId: input.zoneId ?? null,
        employeeId: employee.id,
        kind: input.kind,
        startsAt,
        endsAt,
        timezone,
        notes: input.notes?.trim() || null,
        createdBy: actor.subject.id,
      });
      if (!id) return err(SchedulingErrors.shiftOverlap());
      const [view] = await this.views([(await this.shifts.findById(id))!]);
      return ok(view!);
    });
  }

  /**
   * Creates several shifts, all or nothing. An item may replace one of the officer's drafts, so a
   * grid cell changes in one step; if any item fails, every change of the batch is undone and
   * the error names the item (`details.index`).
   */
  async batch(actor: Principal, input: BatchShiftsRequest): Promise<Result<ShiftView[]>> {
    try {
      return await this.uow.runInTenant(tenantOf(actor), async () => {
        const created: ShiftView[] = [];
        for (const [index, item] of input.items.entries()) {
          const { replaceShiftId, ...request } = item;
          if (replaceShiftId) {
            const old = await this.shifts.findById(replaceShiftId);
            if (!old || old.employeeId !== request.employeeId)
              throw new BatchAbort(index, SchedulingErrors.shiftNotFound());
            if (old.status !== 'draft')
              throw new BatchAbort(index, SchedulingErrors.shiftNotDraft());
            await this.shifts.remove(old.id);
          }
          // Nested in this unit of work, so it joins the batch's transaction.
          const result = await this.create(actor, request);
          if (!result.ok) throw new BatchAbort(index, result.error);
          created.push(result.value);
        }
        return ok(created);
      });
    } catch (error) {
      if (!(error instanceof BatchAbort)) throw error;
      const { kind, code, message, details } = error.cause;
      return err(new DomainError(kind, code, message, { ...details, index: error.index }));
    }
  }

  /** The timezone used to interpret the shift's local date: site, zone, then officer's home. */
  private async timezoneOf(
    input: CreateShiftRequest,
    employee: WorkforceEmployee,
  ): Promise<string> {
    if (input.locationId) {
      const location = await this.workforce.location(input.locationId);
      if (location) return location.timezone;
    }
    if (input.zoneId) {
      const zone = await this.zones.findById(input.zoneId);
      return zone?.locations[0]?.timezone ?? 'UTC';
    }
    if (employee.locationId) {
      const home = await this.workforce.location(employee.locationId);
      if (home) return home.timezone;
    }
    return 'UTC';
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
      const placeName = view?.location?.name ?? view?.zone?.name ?? '';
      const where = (locale: 'en' | 'id') =>
        placeName ? (locale === 'en' ? ` at ${placeName}` : ` di ${placeName}`) : '';
      if (employee && view) {
        await this.notifier.notify(tenantId, {
          userId: employee.userId,
          kind: 'schedule.cancelled',
          text: {
            en: {
              title: 'Shift cancelled',
              body: `${formatCalendarDate(view.localDate, 'en')}, ${view.localStart}–${view.localEnd}${where('en')}.`,
            },
            id: {
              title: 'Shift dibatalkan',
              body: `${formatCalendarDate(view.localDate, 'id')}, ${view.localStart}–${view.localEnd}${where('id')}.`,
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

      // Drafts of the site, plus roving and standby drafts of its zones, plus standby drafts of
      // the officers based here. Other sites' officers are published (and told) by their own site.
      const siteDrafts = (
        await this.shifts.forLocation(location.id, range.start, range.end)
      ).filter((s) => s.status === 'draft');
      const zoneIds = (await this.zones.list())
        .filter((z) => z.locations.some((l) => l.id === location.id))
        .map((z) => z.id);
      const officers = (await this.workforce.employeesByLegalEntity(location.legalEntityId)).filter(
        (e) => e.status === 'active',
      );
      const basedHere = new Set(
        officers.filter((e) => e.locationId === location.id).map((e) => e.id),
      );
      const auxDrafts = (
        await this.shifts.forEmployees(
          officers.map((e) => e.id),
          range.start,
          range.end,
        )
      ).filter(
        (s) =>
          s.status === 'draft' &&
          ((s.zoneId != null && zoneIds.includes(s.zoneId)) ||
            (s.kind === 'standby' &&
              s.locationId == null &&
              s.zoneId == null &&
              basedHere.has(s.employeeId))),
      );
      const published = await this.shifts.publishByIds(
        [...siteDrafts, ...auxDrafts].map((s) => s.id),
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

  /** Copies the previous week's shifts into the given week as new drafts. */
  copyWeek(actor: Principal, query: RosterQuery): Promise<Result<CopyResult>> {
    if (dayCount(query.from, query.to) > MAX_RANGE_DAYS)
      return Promise.resolve(err(SchedulingErrors.rangeTooLong()));
    const WEEK_MS = 7 * 86_400_000;
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const location = await this.workforce.location(query.locationId);
      if (!location) return err(SchedulingErrors.locationNotFound());
      const range = localDaysToUtcRange(query.from, query.to, location.timezone);
      const source = await this.shifts.forLocation(
        location.id,
        new Date(range.start.getTime() - WEEK_MS),
        new Date(range.end.getTime() - WEEK_MS),
      );
      let copied = 0;
      let skipped = 0;
      for (const s of source) {
        const id = await this.shifts.insert({
          locationId: s.locationId,
          zoneId: s.zoneId,
          employeeId: s.employeeId,
          kind: s.kind,
          startsAt: new Date(s.startsAt.getTime() + WEEK_MS),
          endsAt: new Date(s.endsAt.getTime() + WEEK_MS),
          timezone: s.timezone,
          notes: s.notes,
          createdBy: actor.subject.id,
        });
        if (id) copied++;
        else skipped++;
      }
      await this.record(actor, 'roster.copied', location.id, {
        from: query.from,
        to: query.to,
        copied,
        skipped,
      });
      return ok({ copied, skipped });
    });
  }

  /** Conflict warnings for the week's roster, plus the approved leave spans to lock cells. */
  conflicts(actor: Principal, query: RosterQuery): Promise<Result<RosterConflictsView>> {
    if (dayCount(query.from, query.to) > MAX_RANGE_DAYS)
      return Promise.resolve(err(SchedulingErrors.rangeTooLong()));
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const location = await this.workforce.location(query.locationId);
      if (!location) return err(SchedulingErrors.locationNotFound());
      const entity = await this.entities.find(location.legalEntityId);
      const employees = (
        await this.workforce.employeesByLegalEntity(location.legalEntityId)
      ).filter((e) => e.status === 'active');
      const ids = employees.map((e) => e.id);
      // A day of slack either side so the rest rule sees shifts just outside the week.
      const range = localDaysToUtcRange(
        addDays(query.from, -1),
        addDays(query.to, 1),
        location.timezone,
      );
      const [shifts, leaves] = await Promise.all([
        this.shifts.forEmployees(ids, range.start, range.end),
        this.leaves.approvedSpans(ids, query.from, query.to),
      ]);
      const limit = entity ? (WEEKLY_HOUR_LIMITS[entity.countryCode] ?? 44) : 44;
      const conflicts = computeConflicts(
        employees,
        shifts,
        leaves,
        query.from,
        query.to,
        limit,
        location.timezone,
        await this.workforce.allowedSites(ids),
      );
      return ok({ conflicts, leaves });
    });
  }

  /** Roving and standby shifts for the site's week, for the grid's extra lanes. */
  auxiliary(actor: Principal, query: RosterQuery): Promise<Result<RosterAuxiliaryView>> {
    if (dayCount(query.from, query.to) > MAX_RANGE_DAYS)
      return Promise.resolve(err(SchedulingErrors.rangeTooLong()));
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const location = await this.workforce.location(query.locationId);
      if (!location) return err(SchedulingErrors.locationNotFound());
      const zoneIds = (await this.zones.list())
        .filter((z) => z.locations.some((l) => l.id === location.id))
        .map((z) => z.id);
      const ids = (await this.workforce.employeesByLegalEntity(location.legalEntityId))
        .filter((e) => e.status === 'active')
        .map((e) => e.id);
      const range = localDaysToUtcRange(
        addDays(query.from, -1),
        addDays(query.to, 1),
        location.timezone,
      );
      const all = await this.shifts.forEmployees(ids, range.start, range.end);
      const roving = all.filter((s) => s.zoneId && zoneIds.includes(s.zoneId));
      const standby = all.filter((s) => s.kind === 'standby');
      const [rovingViews, standbyViews] = await Promise.all([
        this.views(roving),
        this.views(standby),
      ]);
      const inWeek = (v: ShiftView) => v.localDate >= query.from && v.localDate <= query.to;
      return ok({
        roving: rovingViews.filter(inWeek),
        standby: standbyViews.filter(inWeek),
      });
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
    const locationIds = [
      ...new Set(shifts.map((s) => s.locationId).filter((id): id is string => id != null)),
    ];
    const [employees, locations, zones, attendance] = await Promise.all([
      this.workforce.employeesById(shifts.map((s) => s.employeeId)),
      this.workforce.locationsById(locationIds),
      this.zones.list(),
      this.attendance.forShifts(shifts.map((s) => s.id)),
    ]);
    const zoneById = new Map(zones.map((z) => [z.id, z]));
    return shifts
      .map((s) =>
        toView(
          s,
          employees.get(s.employeeId),
          s.locationId ? locations.get(s.locationId) : undefined,
          s.zoneId ? zoneById.get(s.zoneId) : undefined,
          attendance.get(s.id),
        ),
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
  zone?: Zone,
  attendance?: ShiftAttendance,
): ShiftView {
  const timezone = location?.timezone ?? shift.timezone;
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
    location: location ? { id: location.id, name: location.name } : null,
    zone: zone ? { id: zone.id, name: zone.name } : null,
    employee: {
      id: shift.employeeId,
      fullName: employee?.fullName ?? '',
      employeeNo: employee?.employeeNo ?? '',
    },
    attendance: attendance ?? null,
  };
}

/** Thrown inside a batch to roll its transaction back; carries the failing item's error. */
class BatchAbort extends Error {
  constructor(
    readonly index: number,
    override readonly cause: DomainError,
  ) {
    super(cause.message);
  }
}
