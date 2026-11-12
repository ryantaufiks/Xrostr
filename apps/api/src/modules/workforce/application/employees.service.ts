import { Injectable } from '@nestjs/common';
import type {
  CreateEmployeeRequest,
  CreateEmployeeResponse,
  EmployeeView,
  InviteLink,
  UpdateEmployeeRequest,
} from '@xrostr/contracts';
import { AuditLogger, UnitOfWork } from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import { TenantUserAccess, type Principal, type UserSummary } from '../../identity/public-api.js';
import { LegalEntityDirectory, type LegalEntityWithPack } from '../../tenancy/public-api.js';
import { WorkforceErrors } from '../domain/workforce-errors.js';
import { EmployeeRepository, LocationRepository, type Employee, type Location } from './ports.js';

const tenantOf = (actor: Principal) => actor.subject.tenantId!;

/**
 * Employees and their logins. Creating an employee also creates their account with the
 * chosen role and returns an invite link; deactivating one blocks sign-in at once.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly employees: EmployeeRepository,
    private readonly locations: LocationRepository,
    private readonly entities: LegalEntityDirectory,
    private readonly access: TenantUserAccess,
    private readonly audit: AuditLogger,
  ) {}

  list(actor: Principal): Promise<EmployeeView[]> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const employees = await this.employees.list();
      return this.views(employees);
    });
  }

  create(actor: Principal, input: CreateEmployeeRequest): Promise<Result<CreateEmployeeResponse>> {
    const tenantId = tenantOf(actor);
    return this.uow.runInTenant(tenantId, async () => {
      const entity = await this.entities.find(input.legalEntityId);
      if (!entity) return err(WorkforceErrors.legalEntityNotFound());
      const locationCheck = await this.checkLocation(input.locationId ?? null, entity.id);
      if (!locationCheck.ok) return locationCheck;
      const sitesCheck = await this.checkSites(input.siteIds ?? [], entity.id);
      if (!sitesCheck.ok) return sitesCheck;
      if (await this.employees.employeeNoExists(input.employeeNo)) {
        return err(WorkforceErrors.employeeNoTaken());
      }

      const invited = await this.access.invite(tenantId, {
        email: input.email,
        fullName: input.fullName,
        role: input.role,
      });
      if (!invited.ok) return invited;

      const employeeId = await this.employees.insert({
        userId: invited.value.userId,
        legalEntityId: entity.id,
        locationId: input.locationId ?? null,
        employeeNo: input.employeeNo,
        fullName: input.fullName,
        phone: input.phone ?? null,
        jobTitle: input.jobTitle ?? null,
        employmentType: input.employmentType,
        startDate: input.startDate,
        assignmentType: input.assignmentType ?? 'fixed',
        canRelieve: input.canRelieve ?? false,
      });
      if (input.siteIds?.length) await this.employees.setAllowedSites(employeeId, input.siteIds);
      await this.record(actor, 'employee.created', employeeId, {
        employeeNo: input.employeeNo,
        role: input.role,
      });
      return ok({
        employeeId,
        inviteToken: invited.value.inviteToken,
        inviteExpiresAt: invited.value.inviteExpiresAt.toISOString(),
      });
    });
  }

  update(
    actor: Principal,
    id: string,
    input: UpdateEmployeeRequest,
  ): Promise<Result<EmployeeView>> {
    const tenantId = tenantOf(actor);
    return this.uow.runInTenant(tenantId, async () => {
      const current = await this.employees.findById(id);
      if (!current) return err(WorkforceErrors.employeeNotFound());
      if (input.locationId !== undefined) {
        const locationCheck = await this.checkLocation(input.locationId, current.legalEntityId);
        if (!locationCheck.ok) return locationCheck;
      }
      const { siteIds, ...changes } = input;
      if (siteIds !== undefined) {
        const sitesCheck = await this.checkSites(siteIds, current.legalEntityId);
        if (!sitesCheck.ok) return sitesCheck;
      }

      await this.employees.update(id, changes);
      if (siteIds !== undefined) await this.employees.setAllowedSites(id, [...new Set(siteIds)]);
      if (input.status && input.status !== current.status) {
        await this.access.setAccess(tenantId, current.userId, input.status === 'active');
      }
      await this.record(actor, 'employee.updated', id, { fields: Object.keys(input) });
      const [view] = await this.views([(await this.employees.findById(id))!]);
      return ok(view!);
    });
  }

  reissueInvite(actor: Principal, id: string): Promise<Result<InviteLink>> {
    const tenantId = tenantOf(actor);
    return this.uow.runInTenant(tenantId, async () => {
      const employee = await this.employees.findById(id);
      if (!employee) return err(WorkforceErrors.employeeNotFound());
      const issued = await this.access.reissueInvite(tenantId, employee.userId);
      if (!issued.ok) return issued;
      await this.record(actor, 'employee.invite_reissued', id, {});
      return ok({
        inviteToken: issued.value.inviteToken,
        inviteExpiresAt: issued.value.inviteExpiresAt.toISOString(),
      });
    });
  }

  private async checkLocation(
    locationId: string | null,
    legalEntityId: string,
  ): Promise<Result<void>> {
    if (!locationId) return ok(undefined);
    const location = await this.locations.findById(locationId);
    if (!location) return err(WorkforceErrors.locationNotFound());
    if (location.legalEntityId !== legalEntityId)
      return err(WorkforceErrors.locationInOtherEntity());
    return ok(undefined);
  }

  /** Allowed sites must be the tenant's own sites of the employee's legal entity. */
  private async checkSites(
    siteIds: readonly string[],
    legalEntityId: string,
  ): Promise<Result<void>> {
    for (const id of new Set(siteIds)) {
      const result = await this.checkLocation(id, legalEntityId);
      if (!result.ok) return result;
    }
    return ok(undefined);
  }

  private async views(employees: Employee[]): Promise<EmployeeView[]> {
    const [accounts, entities, locations, sites] = await Promise.all([
      this.access.summarize(employees.map((e) => e.userId)),
      this.entities.list(),
      this.locations.list(),
      this.employees.allowedSites(employees.map((e) => e.id)),
    ]);
    return employees.map((e) =>
      toView(e, accounts.get(e.userId), entities, locations, sites.get(e.id) ?? []),
    );
  }

  private record(actor: Principal, action: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.recordTenant({
      actorType: 'user',
      actorId: actor.subject.id,
      action,
      targetType: 'employee',
      targetId: id,
      metadata,
    });
  }
}

function toView(
  employee: Employee,
  account: UserSummary | undefined,
  entities: LegalEntityWithPack[],
  locations: Location[],
  siteIds: string[],
): EmployeeView {
  const entity = entities.find((x) => x.id === employee.legalEntityId);
  const location = locations.find((x) => x.id === employee.locationId);
  return {
    id: employee.id,
    employeeNo: employee.employeeNo,
    fullName: employee.fullName,
    email: account?.email ?? '',
    phone: employee.phone,
    jobTitle: employee.jobTitle,
    employmentType: employee.employmentType,
    startDate: employee.startDate,
    status: employee.status,
    accountStatus: account?.status ?? 'disabled',
    role: account?.roleKey ?? null,
    assignmentType: employee.assignmentType,
    canRelieve: employee.canRelieve,
    siteIds,
    legalEntity: {
      id: employee.legalEntityId,
      name: entity?.name ?? '',
      countryCode: entity?.countryCode ?? '',
    },
    location: location ? { id: location.id, name: location.name } : null,
  };
}
