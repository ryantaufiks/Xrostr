import type {
  AllowanceKind,
  BankFormat,
  PayBasis,
  PayCycle,
  PayPolicyRequest,
  TaxMethod,
} from '@xrostr/contracts';
import type { Correction, Punches, TimesheetShift } from './timesheet.js';

export type PayPolicy = PayPolicyRequest;

/** All methods require a tenant unit of work. */
export abstract class PayPolicyRepository {
  abstract find(legalEntityId: string): Promise<PayPolicy | null>;
  abstract save(legalEntityId: string, policy: PayPolicy): Promise<void>;
}

export interface PayProfileRecord {
  id: string;
  employeeId: string;
  effectiveFrom: string;
  payCycle: PayCycle;
  payBasis: PayBasis;
  baseAmount: number;
  workDaysPerWeek: 5 | 6;
  overtimeEligible: boolean;
  taxMethod: TaxMethod | null;
  allowances: { label: string; kind: AllowanceKind; amount: number }[];
  ptkpStatus: string | null;
  sgResidency: string | null;
  sgShgFund: string | null;
  pwmGrade: string | null;
  /** Encrypted with the SecretCipher; null when not given. */
  taxIdEnc: string | null;
  bpjsTkNoEnc: string | null;
  bpjsKesNoEnc: string | null;
  dateOfBirthEnc: string | null;
  createdBy: string | null;
  createdAt: Date;
}
export type NewPayProfile = Omit<PayProfileRecord, 'id' | 'createdAt'>;

/** All methods require a tenant unit of work. */
export abstract class PayProfileRepository {
  /** Every version of the employee's profile, newest effective date first. */
  abstract history(employeeId: string): Promise<PayProfileRecord[]>;
  /** Saves a version; one already starting on the same date is replaced. */
  abstract save(profile: NewPayProfile): Promise<string>;
  /** Working days per week of the version in force on `date`, for each employee that has one. */
  abstract workDaysOn(employeeIds: readonly string[], date: string): Promise<Map<string, 5 | 6>>;
}

export interface BankAccountRecord {
  bankName: string;
  accountNoEnc: string;
  accountName: string;
  updatedAt: Date;
}

/** All methods require a tenant unit of work. */
export abstract class BankAccountRepository {
  abstract find(employeeId: string): Promise<BankAccountRecord | null>;
  abstract save(
    employeeId: string,
    account: Omit<BankAccountRecord, 'updatedAt'>,
    by: string,
  ): Promise<void>;
}

export interface CorrectableShift {
  id: string;
  employeeId: string;
  status: string;
  kind: string;
  startsAt: Date;
  endsAt: Date;
}

/** Read side of scheduling and leave data for timesheets; all methods need a tenant unit of work. */
export abstract class TimesheetSource {
  /** Published working and standby shifts of the employees starting within [start, end). */
  abstract shifts(
    employeeIds: readonly string[],
    start: Date,
    end: Date,
  ): Promise<TimesheetShift[]>;
  abstract punches(shiftIds: readonly string[]): Promise<Map<string, Punches>>;
  /** The latest correction of each time, per shift. `by` is the corrector's name. */
  abstract corrections(shiftIds: readonly string[]): Promise<Map<string, Correction>>;
  /** Approved leave of the employees overlapping from..to. */
  abstract approvedLeave(
    employeeIds: readonly string[],
    from: string,
    to: string,
  ): Promise<{ employeeId: string; leaveType: string; startDate: string; endDate: string }[]>;
  abstract shift(id: string): Promise<CorrectableShift | null>;
  abstract insertCorrection(correction: {
    shiftId: string;
    checkIn?: Date | null;
    checkOut?: Date | null;
    reason: string;
    by: string;
  }): Promise<void>;
}

export type { BankFormat };
