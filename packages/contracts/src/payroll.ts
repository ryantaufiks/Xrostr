import { z } from 'zod';
import { BANK_FORMATS, type BankFormat } from './country.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
/** Money in the currency's minor unit: rupiah, or Singapore cents. */
const money = z.number().int().min(0).max(1_000_000_000_000);

export const PAY_CYCLES = ['monthly', 'daily'] as const;
export type PayCycle = (typeof PAY_CYCLES)[number];

export const PAY_BASES = ['monthly', 'daily', 'hourly'] as const;
export type PayBasis = (typeof PAY_BASES)[number];

export const TAX_METHODS = ['gross', 'gross_up'] as const;
export type TaxMethod = (typeof TAX_METHODS)[number];

export const ALLOWANCE_KINDS = ['fixed', 'per_attendance'] as const;
export type AllowanceKind = (typeof ALLOWANCE_KINDS)[number];

/** Indonesian non-taxable income status (PTKP): single/married with 0–3 dependants. */
export const PTKP_STATUSES = ['TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3'] as const;
export const SG_RESIDENCY = ['citizen', 'pr1', 'pr2', 'pr3', 'foreigner'] as const;
export const SG_SHG_FUNDS = ['cdac', 'mbmf', 'sinda', 'ecf', 'none'] as const;

// ---------- Pay policy (per legal entity) ----------

export const ROUNDING_CHOICES = [1, 5, 15, 30] as const;

export const payPolicySchema = z.object({
  overtimeEnabled: z.boolean(),
  /** Worked time is rounded down to this many minutes. */
  roundingMinutes: z.union([z.literal(1), z.literal(5), z.literal(15), z.literal(30)]),
  /** Lateness up to this many minutes is forgiven. */
  lateGraceMinutes: z.number().int().min(0).max(60),
  lateDeduction: z.enum(['none', 'per_minute']),
  standbyRate: money,
  standbyUnit: z.enum(['hour', 'shift']),
  calloutAmount: money,
  nightAllowance: money,
  taxMethod: z.enum(TAX_METHODS),
  bankFormat: z.enum(BANK_FORMATS).nullable(),
  payDay: z.number().int().min(1).max(31),
});
export type PayPolicyRequest = z.infer<typeof payPolicySchema>;

export interface PayPolicyView extends PayPolicyRequest {
  legalEntity: { id: string; name: string; countryCode: string };
  currency: string;
  currencyMinorUnits: number;
  /** False while the entity still runs on the Country Pack defaults. */
  saved: boolean;
}

// ---------- Pay profile (per employee, versioned) ----------

const allowance = z.object({
  label: z.string().trim().min(1).max(60),
  kind: z.enum(ALLOWANCE_KINDS),
  amount: money,
});

export const payProfileSchema = z.object({
  effectiveFrom: isoDate,
  payCycle: z.enum(PAY_CYCLES),
  payBasis: z.enum(PAY_BASES),
  baseAmount: money,
  workDaysPerWeek: z.union([z.literal(5), z.literal(6)]),
  overtimeEligible: z.boolean(),
  /** Null follows the legal entity's policy. */
  taxMethod: z.enum(TAX_METHODS).nullable(),
  allowances: z.array(allowance).max(20),
  // Indonesia
  ptkpStatus: z.enum(PTKP_STATUSES).nullable().optional(),
  /** NPWP or NIK. Omit to keep the stored value; null clears it. */
  taxId: z.string().trim().min(5).max(30).nullable().optional(),
  bpjsTkNo: z.string().trim().min(5).max(30).nullable().optional(),
  bpjsKesNo: z.string().trim().min(5).max(30).nullable().optional(),
  // Singapore
  sgResidency: z.enum(SG_RESIDENCY).nullable().optional(),
  sgShgFund: z.enum(SG_SHG_FUNDS).nullable().optional(),
  pwmGrade: z.string().trim().max(40).nullable().optional(),
  /** CPF rates depend on age. Omit to keep the stored value; null clears it. */
  dateOfBirth: isoDate.nullable().optional(),
});
export type PayProfileRequest = z.infer<typeof payProfileSchema>;

export interface PayProfileVersion {
  id: string;
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
  /** Sensitive values: masked ("•••• 1234") unless revealed. */
  taxId: string | null;
  bpjsTkNo: string | null;
  bpjsKesNo: string | null;
  dateOfBirth: string | null;
  createdAt: string;
}

export interface PayProfileView {
  employee: { id: string; fullName: string; employeeNo: string };
  countryCode: string;
  currency: string;
  currencyMinorUnits: number;
  /** The version in force today, if any. */
  current: PayProfileVersion | null;
  /** Every version, newest effective date first. */
  history: PayProfileVersion[];
  bankAccount: BankAccountView | null;
  /** True when sensitive values are shown in full (the reveal is audited). */
  revealed: boolean;
}

export const bankAccountSchema = z.object({
  bankName: z.string().trim().min(2).max(60),
  accountNo: z
    .string()
    .trim()
    .regex(/^[0-9 -]{5,34}$/, 'Digits only'),
  accountName: z.string().trim().min(2).max(100),
});
export type BankAccountRequest = z.infer<typeof bankAccountSchema>;

export interface BankAccountView {
  bankName: string;
  /** Masked unless revealed. */
  accountNo: string;
  accountName: string;
  updatedAt: string;
}

export const payProfileQuerySchema = z.object({
  reveal: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

// ---------- Timesheet ----------

export const timesheetQuerySchema = z
  .object({ legalEntityId: z.uuid(), from: isoDate, to: isoDate })
  .refine((v) => v.from <= v.to, { path: ['to'], message: 'End must not be before start' });
export type TimesheetQuery = z.infer<typeof timesheetQuerySchema>;

/**
 * - `worked`: checked in and out. `incomplete`: checked in, never out (needs a correction).
 * - `absent`: no check-in, no leave. `leave`: covered by approved leave. `upcoming`: not ended.
 * - `standby`: on call; counted as standby time, not work.
 */
export const TIMESHEET_STATUSES = [
  'worked',
  'incomplete',
  'absent',
  'leave',
  'upcoming',
  'standby',
] as const;
export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];

export interface TimesheetEntry {
  shiftId: string;
  localDate: string;
  localStart: string;
  localEnd: string;
  timezone: string;
  kind: string;
  place: string;
  status: TimesheetStatus;
  /** Effective times, after any correction. */
  checkInAt: string | null;
  checkOutAt: string | null;
  scheduledMinutes: number;
  workedMinutes: number;
  /** After the policy's grace period. */
  lateMinutes: number;
  earlyLeaveMinutes: number;
  /** Overtime on a normal working day (daily or weekly limit); rest-day and holiday time apart. */
  overtimeMinutes: number;
  restDay: boolean;
  publicHoliday: boolean;
  standbyMinutes: number;
  /** A relief shift worked by an officer who was off or on standby. */
  callout: boolean;
  nightShift: boolean;
  corrected: boolean;
  correction: { reason: string; by: string; at: string } | null;
}

export interface TimesheetTotals {
  shifts: number;
  daysWorked: number;
  workedMinutes: number;
  overtimeMinutes: number;
  restDayMinutes: number;
  publicHolidayMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  absences: number;
  incomplete: number;
  standbyMinutes: number;
  standbyShifts: number;
  callouts: number;
  nightShifts: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
}

export interface TimesheetView {
  from: string;
  to: string;
  legalEntity: { id: string; name: string; countryCode: string };
  /** The working-time rule applied, for the page to explain overtime. */
  workingTime: { dailyMinutes: Record<5 | 6, number>; weeklyMinutes: number; basis: string };
  employees: {
    employee: { id: string; fullName: string; employeeNo: string };
    workDaysPerWeek: 5 | 6;
    totals: TimesheetTotals;
    entries: TimesheetEntry[];
  }[];
}

export const timesheetCorrectionSchema = z
  .object({
    /** ISO instants; omit to keep, null to clear. At least one must be given. */
    checkInAt: z.iso.datetime({ offset: true }).nullable().optional(),
    checkOutAt: z.iso.datetime({ offset: true }).nullable().optional(),
    reason: z.string().trim().min(3).max(300),
  })
  .refine((v) => v.checkInAt !== undefined || v.checkOutAt !== undefined, {
    path: ['checkInAt'],
    message: 'Correct the check-in, the check-out, or both',
  });
export type TimesheetCorrectionRequest = z.infer<typeof timesheetCorrectionSchema>;

export type { BankFormat };
