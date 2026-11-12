import { Injectable } from '@nestjs/common';
import {
  MAX_LEAVE_SPAN_DAYS,
  type DecideLeaveRequest,
  type LeaveBalance,
  type LeaveRequestView,
  type LeaveStatus,
  type LeaveTypeRule,
  type MyLeave,
  type RequestLeaveRequest,
} from '@xrostr/contracts';
import { AuditLogger, Clock, UnitOfWork } from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import { TenantUserAccess, type Principal } from '../../identity/public-api.js';
import { Notifier } from '../../notifications/public-api.js';
import { SchedulingDirectory } from '../../scheduling/public-api.js';
import { LegalEntityDirectory, type LegalEntityWithPack } from '../../tenancy/public-api.js';
import { WorkforceDirectory, type WorkforceEmployee } from '../../workforce/public-api.js';
import { chargeableDays, completedMonths, completedYears, spanDays } from '../domain/leave-days.js';
import { LeaveErrors } from '../domain/leave-errors.js';
import { HolidaysService } from './holidays.service.js';
import { LeaveRequestRepository, type LeaveRequest } from './ports.js';

const tenantOf = (actor: Principal) => actor.subject.tenantId!;
const humanDate = (date: string) =>
  new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
const range = (r: Pick<LeaveRequest, 'startDate' | 'endDate'>) =>
  r.startDate === r.endDate
    ? humanDate(r.startDate)
    : `${humanDate(r.startDate)}–${humanDate(r.endDate)}`;

/** Today's date in a time zone, as YYYY-MM-DD. */
const dateIn = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);

interface Me {
  employee: WorkforceEmployee;
  entity: LegalEntityWithPack;
}

/**
 * Leave requests against the statutory leave types of the employee's Country Pack. A leave day
 * is a calendar day that is not a public holiday; approving leave withdraws the shifts in it.
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly requests: LeaveRequestRepository,
    private readonly holidays: HolidaysService,
    private readonly workforce: WorkforceDirectory,
    private readonly entities: LegalEntityDirectory,
    private readonly scheduling: SchedulingDirectory,
    private readonly users: TenantUserAccess,
    private readonly notifier: Notifier,
    private readonly audit: AuditLogger,
    private readonly clock: Clock,
  ) {}

  myLeave(actor: Principal, year?: number): Promise<Result<MyLeave>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const me = await this.me(actor);
      if (!me) return err(LeaveErrors.notAnEmployee());
      const today = dateIn(this.clock.now(), me.entity.pack.defaultTimezone);
      const theYear = year ?? Number(today.slice(0, 4));
      const requests = await this.requests.forEmployeeInYear(me.employee.id, theYear);
      const asOf = `${theYear}-12-31` < today ? `${theYear}-12-31` : today;
      return ok({
        year: theYear,
        countryCode: me.entity.countryCode,
        balances: me.entity.pack.leaveTypes.map((rule) =>
          balance(rule, me.employee, requests, asOf),
        ),
        requests: requests.map((r) => toView(r, me.employee, me.entity, 0)),
      });
    });
  }

  request(actor: Principal, input: RequestLeaveRequest): Promise<Result<LeaveRequestView>> {
    const tenantId = tenantOf(actor);
    return this.uow.runInTenant(tenantId, async () => {
      const me = await this.me(actor);
      if (!me) return err(LeaveErrors.notAnEmployee());
      const rule = me.entity.pack.leaveTypes.find((t) => t.code === input.leaveType);
      if (!rule) return err(LeaveErrors.unknownType());
      const year = Number(input.startDate.slice(0, 4));
      if (Number(input.endDate.slice(0, 4)) !== year) return err(LeaveErrors.crossesYear());
      if (spanDays(input.startDate, input.endDate) > MAX_LEAVE_SPAN_DAYS)
        return err(LeaveErrors.tooLong(MAX_LEAVE_SPAN_DAYS));
      if (completedMonths(me.employee.startDate, input.startDate) < rule.minServiceMonths)
        return err(LeaveErrors.notEligible(rule.minServiceMonths));

      const holidays = await this.holidays.datesBetween(
        me.entity.countryCode,
        input.startDate,
        input.endDate,
      );
      const days = chargeableDays(input.startDate, input.endDate, holidays);
      if (days === 0) return err(LeaveErrors.noLeaveDays());
      if (
        (await this.requests.overlapping(me.employee.id, input.startDate, input.endDate)).length > 0
      )
        return err(LeaveErrors.overlap());
      const sameYear = await this.requests.forEmployeeInYear(me.employee.id, year);
      const { remaining } = balance(rule, me.employee, sameYear, input.startDate);
      if (remaining !== null && days > remaining) return err(LeaveErrors.insufficient(remaining));

      const id = await this.requests.insert({
        employeeId: me.employee.id,
        leaveType: rule.code,
        startDate: input.startDate,
        endDate: input.endDate,
        days,
        reason: input.reason?.trim() || null,
      });
      const approvers = (await this.users.usersWithPermission('leave.approve')).filter(
        (u) => u !== actor.subject.id,
      );
      for (const userId of approvers) {
        await this.notifier.notify(tenantId, {
          userId,
          kind: 'leave.requested',
          title: 'Pengajuan cuti baru',
          body: `${me.employee.fullName}: ${rule.name}, ${range(input)} (${days} hari).`,
          url: '/tenant/leave',
        });
      }
      await this.record(actor, 'leave.requested', id, { leaveType: rule.code, days });
      const created = (await this.requests.findById(id))!;
      return ok(toView(created, me.employee, me.entity, 0));
    });
  }

  cancel(actor: Principal, id: string): Promise<Result<void>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const me = await this.workforce.employeeOfUser(actor.subject.id);
      if (!me) return err(LeaveErrors.notAnEmployee());
      const request = await this.requests.findById(id);
      if (!request || request.employeeId !== me.id) return err(LeaveErrors.notFound());
      if (request.status !== 'pending') return err(LeaveErrors.notPending());
      await this.requests.decide(id, 'cancelled', actor.subject.id, this.clock.now(), null);
      await this.record(actor, 'leave.cancelled', id, {});
      return ok(undefined);
    });
  }

  /** Requests for approvers, with how many shifts each would withdraw. */
  queue(actor: Principal, status: LeaveStatus): Promise<LeaveRequestView[]> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const requests = await this.requests.withStatus(status);
      const [employees, entities] = await Promise.all([
        this.workforce.employeesById(requests.map((r) => r.employeeId)),
        this.entities.list(),
      ]);
      const views: LeaveRequestView[] = [];
      for (const r of requests) {
        const employee = employees.get(r.employeeId);
        const entity = entities.find((e) => e.id === employee?.legalEntityId);
        if (!employee || !entity) continue;
        const shifts =
          status === 'pending'
            ? (await this.scheduling.shiftsOnDates(r.employeeId, r.startDate, r.endDate)).length
            : 0;
        views.push(toView(r, employee, entity, shifts));
      }
      return views;
    });
  }

  decide(
    actor: Principal,
    id: string,
    input: DecideLeaveRequest,
  ): Promise<Result<LeaveRequestView>> {
    const tenantId = tenantOf(actor);
    return this.uow.runInTenant(tenantId, async () => {
      const request = await this.requests.findById(id);
      if (!request) return err(LeaveErrors.notFound());
      if (request.status !== 'pending') return err(LeaveErrors.notPending());
      const employee = await this.workforce.employee(request.employeeId);
      const entity = employee && (await this.entities.find(employee.legalEntityId));
      if (!employee || !entity) return err(LeaveErrors.notFound());
      if (employee.userId === actor.subject.id) return err(LeaveErrors.selfApproval());

      const approve = input.decision === 'approve';
      let withdrawn = 0;
      if (approve) {
        const shifts = await this.scheduling.shiftsOnDates(
          employee.id,
          request.startDate,
          request.endDate,
        );
        await this.scheduling.withdraw(shifts);
        withdrawn = shifts.length;
      }
      const note = input.note?.trim() || null;
      await this.requests.decide(
        id,
        approve ? 'approved' : 'rejected',
        actor.subject.id,
        this.clock.now(),
        note,
      );

      const typeName =
        entity.pack.leaveTypes.find((t) => t.code === request.leaveType)?.name ?? request.leaveType;
      await this.notifier.notify(tenantId, {
        userId: employee.userId,
        kind: approve ? 'leave.approved' : 'leave.rejected',
        title: approve ? 'Cuti disetujui' : 'Cuti ditolak',
        body: `${typeName}, ${range(request)}.${note ? ` Catatan: ${note}` : ''}`,
        url: '/tenant/leave',
      });
      await this.record(actor, approve ? 'leave.approved' : 'leave.rejected', id, {
        employeeId: employee.id,
        shiftsWithdrawn: withdrawn,
      });
      return ok(toView((await this.requests.findById(id))!, employee, entity, withdrawn));
    });
  }

  private async me(actor: Principal): Promise<Me | null> {
    const employee = await this.workforce.employeeOfUser(actor.subject.id);
    if (!employee) return null;
    const entity = await this.entities.find(employee.legalEntityId);
    return entity ? { employee, entity } : null;
  }

  private record(actor: Principal, action: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.recordTenant({
      actorType: 'user',
      actorId: actor.subject.id,
      action,
      targetType: 'leave_request',
      targetId: id,
      metadata,
    });
  }
}

/** Balance of one leave type in the year of `requests`, with service measured up to `asOf`. */
function balance(
  rule: LeaveTypeRule,
  employee: WorkforceEmployee,
  requests: readonly LeaveRequest[],
  asOf: string,
): LeaveBalance {
  const ofType = requests.filter((r) => r.leaveType === rule.code);
  const sum = (status: LeaveStatus) =>
    ofType.filter((r) => r.status === status).reduce((n, r) => n + r.days, 0);
  const used = sum('approved');
  const pending = sum('pending');
  const entitlement = rule.entitlement(completedYears(employee.startDate, asOf));
  return {
    code: rule.code,
    name: rule.name,
    paid: rule.paid,
    requiresDocument: rule.requiresDocument,
    basis: rule.basis,
    entitlement,
    used,
    pending,
    remaining: entitlement === null ? null : Math.max(0, entitlement - used - pending),
    eligible: completedMonths(employee.startDate, asOf) >= rule.minServiceMonths,
  };
}

function toView(
  r: LeaveRequest,
  employee: WorkforceEmployee,
  entity: LegalEntityWithPack,
  conflictingShifts: number,
): LeaveRequestView {
  const rule = entity.pack.leaveTypes.find((t) => t.code === r.leaveType);
  return {
    id: r.id,
    leaveType: { code: r.leaveType, name: rule?.name ?? r.leaveType },
    startDate: r.startDate,
    endDate: r.endDate,
    days: r.days,
    reason: r.reason,
    status: r.status,
    decisionNote: r.decisionNote,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    employee: { id: employee.id, fullName: employee.fullName, employeeNo: employee.employeeNo },
    conflictingShifts,
  };
}
