import { Injectable } from '@nestjs/common';
import type {
  BankAccountRequest,
  BankAccountView,
  PayPolicyRequest,
  PayPolicyView,
  PayProfileRequest,
  PayProfileVersion,
  PayProfileView,
} from '@xrostr/contracts';
import { AuditLogger, Clock, SecretCipher, UnitOfWork } from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { Principal } from '../../identity/public-api.js';
import { LegalEntityDirectory, type LegalEntityWithPack } from '../../tenancy/public-api.js';
import { WorkforceDirectory } from '../../workforce/public-api.js';
import { PayrollErrors } from '../domain/payroll-errors.js';
import {
  BankAccountRepository,
  PayPolicyRepository,
  PayProfileRepository,
  type PayPolicy,
  type PayProfileRecord,
} from './ports.js';

const tenantOf = (actor: Principal) => actor.subject.tenantId!;

/** "•••• 1234": enough to recognise a number without exposing it. */
export const mask = (value: string) => `•••• ${value.replace(/\s/g, '').slice(-4)}`;

/** The policy an entity runs on before anyone saves one: the Country Pack's defaults. */
export function defaultPolicy(entity: LegalEntityWithPack): PayPolicy {
  return {
    overtimeEnabled: true,
    roundingMinutes: 15,
    lateGraceMinutes: 0,
    lateDeduction: 'none',
    standbyRate: 0,
    standbyUnit: 'shift',
    calloutAmount: 0,
    nightAllowance: 0,
    taxMethod: 'gross',
    bankFormat: entity.pack.payroll.defaultBankFormat,
    payDay: 1,
  };
}

/**
 * Payroll set-up: each legal entity's pay policy, and each employee's versioned pay profile and
 * bank account. Tax, BPJS, birth date and account numbers are encrypted at rest and masked in
 * views; showing them in full needs `payroll.manage` and is written to the audit log.
 */
@Injectable()
export class PaySetupService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly policies: PayPolicyRepository,
    private readonly profiles: PayProfileRepository,
    private readonly banks: BankAccountRepository,
    private readonly entities: LegalEntityDirectory,
    private readonly workforce: WorkforceDirectory,
    private readonly cipher: SecretCipher,
    private readonly clock: Clock,
    private readonly audit: AuditLogger,
  ) {}

  listPolicies(actor: Principal): Promise<PayPolicyView[]> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const views: PayPolicyView[] = [];
      for (const entity of await this.entities.list()) views.push(await this.policyView(entity));
      return views;
    });
  }

  savePolicy(
    actor: Principal,
    legalEntityId: string,
    input: PayPolicyRequest,
  ): Promise<Result<PayPolicyView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const entity = await this.entities.find(legalEntityId);
      if (!entity) return err(PayrollErrors.legalEntityNotFound());
      await this.policies.save(entity.id, input);
      await this.record(actor, 'pay_policy.updated', 'legal_entity', entity.id, {
        overtimeEnabled: input.overtimeEnabled,
        taxMethod: input.taxMethod,
        bankFormat: input.bankFormat,
      });
      return ok(await this.policyView(entity));
    });
  }

  profile(actor: Principal, employeeId: string, reveal: boolean): Promise<Result<PayProfileView>> {
    if (reveal && !actor.permissions.includes('payroll.manage'))
      return Promise.resolve(err(PayrollErrors.revealForbidden()));
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const employee = await this.workforce.employee(employeeId);
      if (!employee) return err(PayrollErrors.employeeNotFound());
      const entity = await this.entities.find(employee.legalEntityId);
      if (!entity) return err(PayrollErrors.legalEntityNotFound());
      if (reveal) {
        await this.record(actor, 'pay_profile.revealed', 'employee', employee.id, {});
      }
      return ok(await this.profileView(employee, entity, reveal));
    });
  }

  /**
   * Saves a new version of the employee's pay terms from `effectiveFrom`. Sensitive values left
   * out keep what the latest version had; null clears them.
   */
  saveProfile(
    actor: Principal,
    employeeId: string,
    input: PayProfileRequest,
  ): Promise<Result<PayProfileView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const employee = await this.workforce.employee(employeeId);
      if (!employee) return err(PayrollErrors.employeeNotFound());
      const entity = await this.entities.find(employee.legalEntityId);
      if (!entity) return err(PayrollErrors.legalEntityNotFound());
      const [latest] = await this.profiles.history(employee.id);
      const secret = (given: string | null | undefined, stored: string | null | undefined) =>
        given === undefined ? (stored ?? null) : given === null ? null : this.cipher.encrypt(given);

      await this.profiles.save({
        employeeId: employee.id,
        effectiveFrom: input.effectiveFrom,
        payCycle: input.payCycle,
        payBasis: input.payBasis,
        baseAmount: input.baseAmount,
        workDaysPerWeek: input.workDaysPerWeek,
        overtimeEligible: input.overtimeEligible,
        taxMethod: input.taxMethod,
        allowances: input.allowances,
        ptkpStatus: input.ptkpStatus ?? null,
        sgResidency: input.sgResidency ?? null,
        sgShgFund: input.sgShgFund ?? null,
        pwmGrade: input.pwmGrade?.trim() || null,
        taxIdEnc: secret(input.taxId, latest?.taxIdEnc),
        bpjsTkNoEnc: secret(input.bpjsTkNo, latest?.bpjsTkNoEnc),
        bpjsKesNoEnc: secret(input.bpjsKesNo, latest?.bpjsKesNoEnc),
        dateOfBirthEnc: secret(input.dateOfBirth, latest?.dateOfBirthEnc),
        createdBy: actor.subject.id,
      });
      // No amounts or identifiers in the audit trail: who changed whose pay, and from when.
      await this.record(actor, 'pay_profile.saved', 'employee', employee.id, {
        effectiveFrom: input.effectiveFrom,
        payBasis: input.payBasis,
      });
      return ok(await this.profileView(employee, entity, false));
    });
  }

  saveBankAccount(
    actor: Principal,
    employeeId: string,
    input: BankAccountRequest,
  ): Promise<Result<BankAccountView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const employee = await this.workforce.employee(employeeId);
      if (!employee) return err(PayrollErrors.employeeNotFound());
      await this.banks.save(
        employee.id,
        {
          bankName: input.bankName,
          accountNoEnc: this.cipher.encrypt(input.accountNo.replace(/[\s-]/g, '')),
          accountName: input.accountName,
        },
        actor.subject.id,
      );
      await this.record(actor, 'bank_account.saved', 'employee', employee.id, {
        bankName: input.bankName,
      });
      return ok(this.bankView((await this.banks.find(employee.id))!, false));
    });
  }

  private async policyView(entity: LegalEntityWithPack): Promise<PayPolicyView> {
    const saved = await this.policies.find(entity.id);
    return {
      ...(saved ?? defaultPolicy(entity)),
      legalEntity: { id: entity.id, name: entity.name, countryCode: entity.countryCode },
      currency: entity.pack.currency,
      currencyMinorUnits: entity.pack.currencyMinorUnits,
      saved: saved !== null,
    };
  }

  private async profileView(
    employee: { id: string; fullName: string; employeeNo: string },
    entity: LegalEntityWithPack,
    reveal: boolean,
  ): Promise<PayProfileView> {
    const history = await this.profiles.history(employee.id);
    const today = this.clock.now().toISOString().slice(0, 10);
    const current = history.find((v) => v.effectiveFrom <= today) ?? null;
    const bank = await this.banks.find(employee.id);
    return {
      employee: { id: employee.id, fullName: employee.fullName, employeeNo: employee.employeeNo },
      countryCode: entity.countryCode,
      currency: entity.pack.currency,
      currencyMinorUnits: entity.pack.currencyMinorUnits,
      current: current ? this.versionView(current, reveal) : null,
      history: history.map((v) => this.versionView(v, reveal)),
      bankAccount: bank ? this.bankView(bank, reveal) : null,
      revealed: reveal,
    };
  }

  private versionView(v: PayProfileRecord, reveal: boolean): PayProfileVersion {
    const open = (enc: string | null, masked = true) => {
      if (!enc) return null;
      const plain = this.cipher.decrypt(enc);
      return reveal || !masked ? plain : mask(plain);
    };
    return {
      id: v.id,
      effectiveFrom: v.effectiveFrom,
      payCycle: v.payCycle,
      payBasis: v.payBasis,
      baseAmount: v.baseAmount,
      workDaysPerWeek: v.workDaysPerWeek,
      overtimeEligible: v.overtimeEligible,
      taxMethod: v.taxMethod,
      allowances: v.allowances,
      ptkpStatus: v.ptkpStatus,
      sgResidency: v.sgResidency,
      sgShgFund: v.sgShgFund,
      pwmGrade: v.pwmGrade,
      taxId: open(v.taxIdEnc),
      bpjsTkNo: open(v.bpjsTkNoEnc),
      bpjsKesNo: open(v.bpjsKesNoEnc),
      // Only the year is shown masked: enough to see the CPF age band.
      dateOfBirth: v.dateOfBirthEnc
        ? reveal
          ? this.cipher.decrypt(v.dateOfBirthEnc)
          : `${this.cipher.decrypt(v.dateOfBirthEnc).slice(0, 4)}-••-••`
        : null,
      createdAt: v.createdAt.toISOString(),
    };
  }

  private bankView(
    b: { bankName: string; accountNoEnc: string; accountName: string; updatedAt: Date },
    reveal: boolean,
  ): BankAccountView {
    const number = this.cipher.decrypt(b.accountNoEnc);
    return {
      bankName: b.bankName,
      accountNo: reveal ? number : mask(number),
      accountName: b.accountName,
      updatedAt: b.updatedAt.toISOString(),
    };
  }

  private record(
    actor: Principal,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.recordTenant({
      actorType: 'user',
      actorId: actor.subject.id,
      action,
      targetType,
      targetId,
      metadata,
    });
  }
}
