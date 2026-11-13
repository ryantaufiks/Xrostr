import { Injectable } from '@nestjs/common';
import {
  expandRotation,
  SHIFT_PRESETS,
  WEEKLY_HOUR_LIMITS,
  type BatchShiftsRequest,
  type RosterQuery,
  type RosterSuggestionsView,
  type RotationResult,
  type RotationStep,
} from '@xrostr/contracts';
import { AuditLogger, UnitOfWork } from '../../../shared/application/ports.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { addDays, localDaysToUtcRange, utcToLocal } from '../../../shared/domain/local-time.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { Principal } from '../../identity/public-api.js';
import { LegalEntityDirectory } from '../../tenancy/public-api.js';
import { WorkforceDirectory } from '../../workforce/public-api.js';
import { SchedulingErrors } from '../domain/scheduling-errors.js';
import { LeaveCalendarRepository, ShiftRepository, StaffingRepository } from './ports.js';
import { suggestFill } from './roster-suggestions.js';
import { SchedulingService } from './scheduling.service.js';

const MAX_RANGE_DAYS = 62;
const tenantOf = (actor: Principal) => actor.subject.tenantId!;
const dayCount = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;

export interface RotationInput {
  locationId: string;
  employeeId: string;
  from: string;
  to: string;
  pattern: RotationStep[];
  startAt: number;
}

/** Planning aids on top of the roster: rotation patterns and staffing suggestions. */
@Injectable()
export class PlanningService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly shifts: ShiftRepository,
    private readonly staffing: StaffingRepository,
    private readonly leaves: LeaveCalendarRepository,
    private readonly workforce: WorkforceDirectory,
    private readonly entities: LegalEntityDirectory,
    private readonly scheduling: SchedulingService,
    private readonly audit: AuditLogger,
  ) {}

  /**
   * Turns a rotation into drafts for one officer at one site, so the range matches the pattern:
   * working days get a draft (replacing any draft there), days off lose their draft. Days on
   * approved leave or with a published shift are left alone. One transaction: a clash anywhere
   * names its date and changes nothing.
   */
  async rotation(actor: Principal, input: RotationInput): Promise<Result<RotationResult>> {
    if (dayCount(input.from, input.to) > MAX_RANGE_DAYS)
      return err(SchedulingErrors.rangeTooLong());
    try {
      return await this.uow.runInTenant(tenantOf(actor), async () => {
        const location = await this.workforce.location(input.locationId);
        if (!location) return err(SchedulingErrors.locationNotFound());
        const employee = await this.workforce.employee(input.employeeId);
        if (!employee) return err(SchedulingErrors.employeeNotFound());

        const range = localDaysToUtcRange(input.from, input.to, location.timezone);
        const existing = (
          await this.shifts.forEmployees([employee.id], range.start, range.end)
        ).filter((s) => s.locationId === location.id);
        const leaveDays = new Set<string>();
        for (const span of await this.leaves.approvedSpans([employee.id], input.from, input.to))
          for (let d = span.startDate; d <= span.endDate; d = addDays(d, 1)) leaveDays.add(d);

        const items: BatchShiftsRequest['items'] = [];
        const skipped: RotationResult['skipped'] = [];
        let removed = 0;
        for (const { date, step } of expandRotation(
          input.pattern,
          input.from,
          input.to,
          input.startAt,
        )) {
          const sameDay = existing.filter(
            (s) => utcToLocal(s.startsAt, location.timezone).date === date,
          );
          const draft = sameDay.find((s) => s.status === 'draft');
          if (step === 'off') {
            if (draft) {
              await this.shifts.remove(draft.id);
              removed++;
            }
            continue;
          }
          if (leaveDays.has(date)) {
            skipped.push({ date, reason: 'leave' });
            continue;
          }
          if (sameDay.some((s) => s.status === 'published')) {
            skipped.push({ date, reason: 'published' });
            continue;
          }
          items.push({
            locationId: location.id,
            employeeId: employee.id,
            date,
            startTime: SHIFT_PRESETS[step].start,
            durationHours: SHIFT_PRESETS[step].hours,
            kind: step,
            ...(draft && { replaceShiftId: draft.id }),
          });
        }

        let created = 0;
        if (items.length > 0) {
          // Joins this transaction; on failure the throw below undoes the removals too.
          const result = await this.scheduling.batch(actor, { items });
          if (!result.ok) {
            const { kind, code, message, details } = result.error;
            const index = typeof details?.index === 'number' ? details.index : -1;
            throw new RotationAbort(
              new DomainError(kind, code, message, { ...details, date: items[index]?.date }),
            );
          }
          created = result.value.length;
        }
        await this.audit.recordTenant({
          actorType: 'user',
          actorId: actor.subject.id,
          action: 'roster.rotation_applied',
          targetType: 'location',
          targetId: location.id,
          metadata: {
            employeeId: employee.id,
            from: input.from,
            to: input.to,
            created,
            removed,
            skipped: skipped.length,
          },
        });
        return ok({ created, removed, skipped });
      });
    } catch (error) {
      if (error instanceof RotationAbort) return err(error.cause);
      throw error;
    }
  }

  /** Who could fill the day and night shifts the site is short of, without breaking a rule. */
  suggestions(actor: Principal, query: RosterQuery): Promise<Result<RosterSuggestionsView>> {
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
      // A week of slack either side: weekly hours and rest look past the range's edges.
      const range = localDaysToUtcRange(
        addDays(query.from, -7),
        addDays(query.to, 7),
        location.timezone,
      );
      const shifts = await this.shifts.forEmployees(ids, range.start, range.end);
      const leaves = await this.leaves.approvedSpans(ids, query.from, query.to);
      const requirements = await this.staffing.forLocation(location.id);
      const allowedSites = await this.workforce.allowedSites(ids);
      const days: string[] = [];
      for (let d = query.from; d <= query.to; d = addDays(d, 1)) days.push(d);
      return ok(
        suggestFill(employees, {
          siteId: location.id,
          timezone: location.timezone,
          days,
          requirements,
          shifts,
          leaves,
          allowedSites,
          weeklyLimit: entity ? (WEEKLY_HOUR_LIMITS[entity.countryCode] ?? 44) : 44,
        }),
      );
    });
  }
}

/** Thrown to roll a rotation's transaction back; carries the error to report. */
class RotationAbort extends Error {
  constructor(override readonly cause: DomainError) {
    super(cause.message);
  }
}
