import { Injectable } from '@nestjs/common';
import type { TimesheetCorrectionRequest, TimesheetQuery, TimesheetView } from '@xrostr/contracts';
import { AuditLogger, Clock, UnitOfWork } from '../../../shared/application/ports.js';
import { localDaysToUtcRange } from '../../../shared/domain/local-time.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { Principal } from '../../identity/public-api.js';
import { HolidaysService } from '../../leave/public-api.js';
import { LegalEntityDirectory } from '../../tenancy/public-api.js';
import { WorkforceDirectory } from '../../workforce/public-api.js';
import { PayrollErrors } from '../domain/payroll-errors.js';
import { defaultPolicy } from './pay-setup.service.js';
import { PayPolicyRepository, PayProfileRepository, TimesheetSource } from './ports.js';
import { computeTimesheets, weekRange } from './timesheet.js';

const MAX_RANGE_DAYS = 62;
const HOUR_MS = 3_600_000;
/** A corrected time may sit this far outside the shift (early arrival, late departure). */
const CORRECTION_SLACK_MS = 4 * HOUR_MS;
const tenantOf = (actor: Principal) => actor.subject.tenantId!;
const dayCount = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;

/**
 * Timesheets of a legal entity's officers for a period, derived from published shifts,
 * attendance, corrections, approved leave and public holidays. Nothing is stored: the same data
 * always gives the same timesheet, and a correction shows up at once.
 */
@Injectable()
export class TimesheetService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly source: TimesheetSource,
    private readonly profiles: PayProfileRepository,
    private readonly policies: PayPolicyRepository,
    private readonly entities: LegalEntityDirectory,
    private readonly workforce: WorkforceDirectory,
    private readonly holidays: HolidaysService,
    private readonly clock: Clock,
    private readonly audit: AuditLogger,
  ) {}

  view(actor: Principal, query: TimesheetQuery): Promise<Result<TimesheetView>> {
    if (dayCount(query.from, query.to) > MAX_RANGE_DAYS)
      return Promise.resolve(err(PayrollErrors.rangeTooLong()));
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const entity = await this.entities.find(query.legalEntityId);
      if (!entity) return err(PayrollErrors.legalEntityNotFound());
      const people = await this.workforce.employeesByLegalEntity(entity.id);
      const ids = people.map((e) => e.id);
      const weeks = weekRange(query.from, query.to);
      // Shifts are fetched a day wider than the weeks: every site's time zone is covered.
      const range = localDaysToUtcRange(weeks.from, weeks.to, 'UTC');
      const shifts = await this.source.shifts(
        ids,
        new Date(range.start.getTime() - 24 * HOUR_MS),
        new Date(range.end.getTime() + 24 * HOUR_MS),
      );
      const shiftIds = shifts.map((s) => s.id);
      const punches = await this.source.punches(shiftIds);
      const corrections = await this.source.corrections(shiftIds);
      const leave = await this.source.approvedLeave(ids, query.from, query.to);
      const holidays = await this.holidays.datesBetween(entity.countryCode, weeks.from, weeks.to);
      const workDays = await this.profiles.workDaysOn(ids, query.to);
      const policy = (await this.policies.find(entity.id)) ?? defaultPolicy(entity);
      const paid = new Map(entity.pack.leaveTypes.map((t) => [t.code, t.paid]));

      const sheets = computeTimesheets({
        from: query.from,
        to: query.to,
        now: this.clock.now(),
        shifts,
        punches,
        corrections,
        leaves: leave.map((l) => ({ ...l, paid: paid.get(l.leaveType) ?? false })),
        holidays,
        workingTime: entity.pack.payroll.workingTime,
        workDaysPerWeek: workDays,
        defaultWorkDaysPerWeek: entity.pack.payroll.defaultWorkDaysPerWeek,
        roundingMinutes: policy.roundingMinutes,
        lateGraceMinutes: policy.lateGraceMinutes,
      });
      const byId = new Map(people.map((p) => [p.id, p]));
      return ok({
        from: query.from,
        to: query.to,
        legalEntity: { id: entity.id, name: entity.name, countryCode: entity.countryCode },
        workingTime: {
          dailyMinutes: { ...entity.pack.payroll.workingTime.dailyMinutes },
          weeklyMinutes: entity.pack.payroll.workingTime.weeklyMinutes,
          basis: entity.pack.payroll.workingTime.basis,
        },
        employees: sheets
          .filter(
            (s) => s.entries.length > 0 || s.totals.paidLeaveDays + s.totals.unpaidLeaveDays > 0,
          )
          .map((s) => {
            const e = byId.get(s.employeeId)!;
            return {
              employee: { id: e.id, fullName: e.fullName, employeeNo: e.employeeNo },
              workDaysPerWeek: s.workDaysPerWeek,
              totals: s.totals,
              entries: s.entries,
            };
          })
          .sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName)),
      });
    });
  }

  /**
   * Corrects a shift's check-in and/or check-out for payroll. The original attendance stays as
   * it was; the correction, its reason and who made it are kept and audited.
   */
  correct(
    actor: Principal,
    shiftId: string,
    input: TimesheetCorrectionRequest,
  ): Promise<Result<void>> {
    const allowed = ['schedules.manage', 'payroll.manage'] as const;
    if (!allowed.some((p) => actor.permissions.includes(p)))
      return Promise.resolve(err(PayrollErrors.correctionForbidden()));
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const shift = await this.source.shift(shiftId);
      if (!shift) return err(PayrollErrors.shiftNotFound());
      if (
        shift.status !== 'published' ||
        shift.kind === 'standby' ||
        shift.startsAt > this.clock.now()
      )
        return err(PayrollErrors.shiftNotStarted());

      const toDate = (v: string | null | undefined) =>
        v === undefined ? undefined : v === null ? null : new Date(v);
      const checkIn = toDate(input.checkInAt);
      const checkOut = toDate(input.checkOutAt);
      const lo = shift.startsAt.getTime() - CORRECTION_SLACK_MS;
      const hi = shift.endsAt.getTime() + CORRECTION_SLACK_MS;
      for (const t of [checkIn, checkOut])
        if (t && (t.getTime() < lo || t.getTime() > hi))
          return err(PayrollErrors.correctionOutOfRange());

      // Compare with what the other time will be once this correction applies.
      const current = (await this.source.punches([shift.id])).get(shift.id);
      const earlier = (await this.source.corrections([shift.id])).get(shift.id);
      const effIn =
        checkIn !== undefined
          ? checkIn
          : earlier?.checkIn !== undefined
            ? earlier.checkIn
            : (current?.checkInAt ?? null);
      const effOut =
        checkOut !== undefined
          ? checkOut
          : earlier?.checkOut !== undefined
            ? earlier.checkOut
            : (current?.checkOutAt ?? null);
      if (effIn && effOut && effOut <= effIn) return err(PayrollErrors.correctionOrder());

      await this.source.insertCorrection({
        shiftId: shift.id,
        ...(checkIn !== undefined && { checkIn }),
        ...(checkOut !== undefined && { checkOut }),
        reason: input.reason,
        by: actor.subject.id,
      });
      await this.audit.recordTenant({
        actorType: 'user',
        actorId: actor.subject.id,
        action: 'timesheet.corrected',
        targetType: 'shift',
        targetId: shift.id,
        metadata: {
          employeeId: shift.employeeId,
          checkIn: checkIn === undefined ? 'unchanged' : (checkIn?.toISOString() ?? null),
          checkOut: checkOut === undefined ? 'unchanged' : (checkOut?.toISOString() ?? null),
          reason: input.reason,
        },
      });
      return ok(undefined);
    });
  }
}
