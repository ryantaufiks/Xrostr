import { Injectable } from '@nestjs/common';
import type { AllowanceKind, BankFormat, PayBasis, PayCycle, TaxMethod } from '@xrostr/contracts';
import {
  attendanceEvents,
  employeeBankAccounts,
  leaveRequests,
  locations,
  payPolicies,
  payProfileAllowances,
  payProfiles,
  shifts,
  timesheetCorrections,
  users,
  zones,
} from '@xrostr/db';
import { and, asc, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import {
  BankAccountRepository,
  PayPolicyRepository,
  PayProfileRepository,
  TimesheetSource,
  type BankAccountRecord,
  type CorrectableShift,
  type NewPayProfile,
  type PayPolicy,
  type PayProfileRecord,
} from '../application/ports.js';
import type { Correction, Punches, TimesheetShift } from '../application/timesheet.js';

@Injectable()
export class DrizzlePayPolicyRepository extends PayPolicyRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async find(legalEntityId: string): Promise<PayPolicy | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(payPolicies)
      .where(eq(payPolicies.legalEntityId, legalEntityId))
      .limit(1);
    if (!row) return null;
    return {
      overtimeEnabled: row.overtimeEnabled,
      roundingMinutes: row.roundingMinutes as PayPolicy['roundingMinutes'],
      lateGraceMinutes: row.lateGraceMinutes,
      lateDeduction: row.lateDeduction as PayPolicy['lateDeduction'],
      standbyRate: row.standbyRate,
      standbyUnit: row.standbyUnit as PayPolicy['standbyUnit'],
      calloutAmount: row.calloutAmount,
      nightAllowance: row.nightAllowance,
      taxMethod: row.taxMethod as TaxMethod,
      bankFormat: row.bankFormat as BankFormat | null,
      payDay: row.payDay,
    };
  }

  async save(legalEntityId: string, policy: PayPolicy): Promise<void> {
    await this.ctx
      .executor()
      .insert(payPolicies)
      .values({ ...policy, legalEntityId, tenantId: this.ctx.tenantId() })
      .onConflictDoUpdate({
        target: payPolicies.legalEntityId,
        set: { ...policy, updatedAt: new Date() },
      });
  }
}

@Injectable()
export class DrizzlePayProfileRepository extends PayProfileRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async history(employeeId: string): Promise<PayProfileRecord[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(payProfiles)
      .where(eq(payProfiles.employeeId, employeeId))
      .orderBy(desc(payProfiles.effectiveFrom));
    if (rows.length === 0) return [];
    const allowances = await this.ctx
      .executor()
      .select()
      .from(payProfileAllowances)
      .where(
        inArray(
          payProfileAllowances.profileId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(payProfileAllowances.position));
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      effectiveFrom: r.effectiveFrom,
      payCycle: r.payCycle as PayCycle,
      payBasis: r.payBasis as PayBasis,
      baseAmount: r.baseAmount,
      workDaysPerWeek: r.workDaysPerWeek as 5 | 6,
      overtimeEligible: r.overtimeEligible,
      taxMethod: r.taxMethod as TaxMethod | null,
      allowances: allowances
        .filter((a) => a.profileId === r.id)
        .map((a) => ({ label: a.label, kind: a.kind as AllowanceKind, amount: a.amount })),
      ptkpStatus: r.ptkpStatus,
      sgResidency: r.sgResidency,
      sgShgFund: r.sgShgFund,
      pwmGrade: r.pwmGrade,
      taxIdEnc: r.taxIdEnc,
      bpjsTkNoEnc: r.bpjsTkNoEnc,
      bpjsKesNoEnc: r.bpjsKesNoEnc,
      dateOfBirthEnc: r.dateOfBirthEnc,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  }

  async save(profile: NewPayProfile): Promise<string> {
    const db = this.ctx.executor();
    const tenantId = this.ctx.tenantId();
    // Same start date: the new terms replace that version (allowances go with it).
    await db
      .delete(payProfiles)
      .where(
        and(
          eq(payProfiles.employeeId, profile.employeeId),
          eq(payProfiles.effectiveFrom, profile.effectiveFrom),
        ),
      );
    const { allowances, ...row } = profile;
    const [saved] = await db
      .insert(payProfiles)
      .values({ ...row, tenantId })
      .returning({ id: payProfiles.id });
    if (allowances.length > 0) {
      await db
        .insert(payProfileAllowances)
        .values(
          allowances.map((a, position) => ({ ...a, position, profileId: saved!.id, tenantId })),
        );
    }
    return saved!.id;
  }

  async workDaysOn(employeeIds: readonly string[], date: string): Promise<Map<string, 5 | 6>> {
    const result = new Map<string, 5 | 6>();
    if (employeeIds.length === 0) return result;
    const rows = await this.ctx
      .executor()
      .select({
        employeeId: payProfiles.employeeId,
        workDays: payProfiles.workDaysPerWeek,
      })
      .from(payProfiles)
      .where(
        and(
          inArray(payProfiles.employeeId, [...employeeIds]),
          lte(payProfiles.effectiveFrom, date),
        ),
      )
      .orderBy(desc(payProfiles.effectiveFrom));
    // Newest first: the first row per employee is the version in force.
    for (const r of rows)
      if (!result.has(r.employeeId)) result.set(r.employeeId, r.workDays as 5 | 6);
    return result;
  }
}

@Injectable()
export class DrizzleBankAccountRepository extends BankAccountRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async find(employeeId: string): Promise<BankAccountRecord | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(employeeBankAccounts)
      .where(eq(employeeBankAccounts.employeeId, employeeId))
      .limit(1);
    return row
      ? {
          bankName: row.bankName,
          accountNoEnc: row.accountNoEnc,
          accountName: row.accountName,
          updatedAt: row.updatedAt,
        }
      : null;
  }

  async save(
    employeeId: string,
    account: Omit<BankAccountRecord, 'updatedAt'>,
    by: string,
  ): Promise<void> {
    const values = { ...account, updatedBy: by, updatedAt: new Date() };
    await this.ctx
      .executor()
      .insert(employeeBankAccounts)
      .values({ ...values, employeeId, tenantId: this.ctx.tenantId() })
      .onConflictDoUpdate({ target: employeeBankAccounts.employeeId, set: values });
  }
}

@Injectable()
export class DrizzleTimesheetSource extends TimesheetSource {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async shifts(employeeIds: readonly string[], start: Date, end: Date): Promise<TimesheetShift[]> {
    if (employeeIds.length === 0) return [];
    const rows = await this.ctx
      .executor()
      .select({
        id: shifts.id,
        employeeId: shifts.employeeId,
        kind: shifts.kind,
        startsAt: shifts.startsAt,
        endsAt: shifts.endsAt,
        timezone: shifts.timezone,
        site: locations.name,
        siteTimezone: locations.timezone,
        zone: zones.name,
        replacesShiftId: shifts.replacesShiftId,
      })
      .from(shifts)
      .leftJoin(locations, eq(locations.id, shifts.locationId))
      .leftJoin(zones, eq(zones.id, shifts.zoneId))
      .where(
        and(
          inArray(shifts.employeeId, [...employeeIds]),
          eq(shifts.status, 'published'),
          gte(shifts.startsAt, start),
          lt(shifts.startsAt, end),
        ),
      )
      .orderBy(asc(shifts.startsAt));
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      kind: r.kind,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      timezone: r.siteTimezone ?? r.timezone,
      place: r.site ?? r.zone ?? '',
      replacesShiftId: r.replacesShiftId,
    }));
  }

  async punches(shiftIds: readonly string[]): Promise<Map<string, Punches>> {
    const result = new Map<string, Punches>();
    if (shiftIds.length === 0) return result;
    const rows = await this.ctx
      .executor()
      .select({
        shiftId: attendanceEvents.shiftId,
        kind: attendanceEvents.kind,
        at: attendanceEvents.occurredAt,
      })
      .from(attendanceEvents)
      .where(inArray(attendanceEvents.shiftId, [...shiftIds]));
    for (const r of rows) {
      const entry = result.get(r.shiftId) ?? { checkInAt: null, checkOutAt: null };
      if (r.kind === 'check_in') entry.checkInAt = r.at;
      else if (r.kind === 'check_out') entry.checkOutAt = r.at;
      result.set(r.shiftId, entry);
    }
    return result;
  }

  async corrections(shiftIds: readonly string[]): Promise<Map<string, Correction>> {
    const result = new Map<string, Correction>();
    if (shiftIds.length === 0) return result;
    const rows = await this.ctx
      .executor()
      .select({
        shiftId: timesheetCorrections.shiftId,
        checkInSet: timesheetCorrections.checkInSet,
        checkInAt: timesheetCorrections.checkInAt,
        checkOutSet: timesheetCorrections.checkOutSet,
        checkOutAt: timesheetCorrections.checkOutAt,
        reason: timesheetCorrections.reason,
        by: users.fullName,
        at: timesheetCorrections.createdAt,
      })
      .from(timesheetCorrections)
      .leftJoin(users, eq(users.id, timesheetCorrections.correctedBy))
      .where(inArray(timesheetCorrections.shiftId, [...shiftIds]))
      .orderBy(asc(timesheetCorrections.createdAt));
    // Oldest first: later corrections overwrite the times they set.
    for (const r of rows) {
      const entry: Correction = result.get(r.shiftId) ?? { reason: '', by: '', at: r.at };
      if (r.checkInSet) entry.checkIn = r.checkInAt;
      if (r.checkOutSet) entry.checkOut = r.checkOutAt;
      entry.reason = r.reason;
      entry.by = r.by ?? '';
      entry.at = r.at;
      result.set(r.shiftId, entry);
    }
    return result;
  }

  async approvedLeave(employeeIds: readonly string[], from: string, to: string) {
    if (employeeIds.length === 0) return [];
    return this.ctx
      .executor()
      .select({
        employeeId: leaveRequests.employeeId,
        leaveType: leaveRequests.leaveType,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
      })
      .from(leaveRequests)
      .where(
        and(
          inArray(leaveRequests.employeeId, [...employeeIds]),
          eq(leaveRequests.status, 'approved'),
          lte(leaveRequests.startDate, to),
          gte(leaveRequests.endDate, from),
        ),
      );
  }

  async shift(id: string): Promise<CorrectableShift | null> {
    const [row] = await this.ctx
      .executor()
      .select({
        id: shifts.id,
        employeeId: shifts.employeeId,
        status: shifts.status,
        kind: shifts.kind,
        startsAt: shifts.startsAt,
        endsAt: shifts.endsAt,
      })
      .from(shifts)
      .where(eq(shifts.id, id))
      .limit(1);
    return row ?? null;
  }

  async insertCorrection(c: {
    shiftId: string;
    checkIn?: Date | null;
    checkOut?: Date | null;
    reason: string;
    by: string;
  }): Promise<void> {
    await this.ctx
      .executor()
      .insert(timesheetCorrections)
      .values({
        tenantId: this.ctx.tenantId(),
        shiftId: c.shiftId,
        checkInSet: c.checkIn !== undefined,
        checkInAt: c.checkIn ?? null,
        checkOutSet: c.checkOut !== undefined,
        checkOutAt: c.checkOut ?? null,
        reason: c.reason,
        correctedBy: c.by,
      });
  }
}
