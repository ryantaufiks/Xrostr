import type { Localized } from './locale.js';

export const COUNTRY_CODES = ['SG', 'ID'] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export const DATA_REGIONS = ['sg', 'id'] as const;
export type DataRegion = (typeof DATA_REGIONS)[number];

/**
 * A statutory leave type. `entitlement` returns the days for a leave year given completed
 * years of service, or null when the law sets no fixed quota (taken with evidence instead).
 */
export interface LeaveTypeRule {
  readonly code: string;
  readonly name: Localized<string>;
  readonly paid: boolean;
  readonly requiresDocument: boolean;
  /** Service needed before the type can be used at all. */
  readonly minServiceMonths: number;
  readonly entitlement: (completedYears: number) => number | null;
  /** Short legal basis shown to HR, e.g. "Employment Act s.43". */
  readonly basis: string;
}

export interface HolidayDefault {
  readonly date: string;
  readonly name: string;
}

/**
 * Normal working time before overtime, by the number of working days in the officer's week.
 * Hours past the daily limit, or past the weekly limit, are overtime (whichever gives more).
 */
export interface WorkingTimeRule {
  readonly dailyMinutes: Readonly<Record<5 | 6, number>>;
  readonly weeklyMinutes: number;
  /** Short legal basis shown to HR. */
  readonly basis: string;
}

/** Payroll defaults of a country. Rates (overtime multipliers, contributions, tax) come in 3B. */
export interface PayrollRules {
  readonly workingTime: WorkingTimeRule;
  /** Working days per week assumed for an officer without a pay profile. */
  readonly defaultWorkDaysPerWeek: 5 | 6;
  /** Bank file format offered by default; the tenant may clear it. */
  readonly defaultBankFormat: BankFormat | null;
}

export const BANK_FORMATS = ['mandiri', 'dbs'] as const;
export type BankFormat = (typeof BANK_FORMATS)[number];

/** Static metadata of a Country Pack. Payroll rules are versioned data, added in Phase 3. */
export interface CountryPack {
  readonly code: CountryCode;
  readonly name: string;
  readonly currency: string;
  /** Number of decimal places of the currency's minor unit (SGD = 2, IDR = 0). */
  readonly currencyMinorUnits: number;
  readonly defaultTimezone: string;
  readonly timezones: readonly string[];
  readonly locale: string;
  readonly defaultDataRegion: DataRegion;
  readonly leaveTypes: readonly LeaveTypeRule[];
  /**
   * Starting public-holiday calendar per year, copied into a tenant on first use and editable
   * there. Lunar-calendar dates must be checked against the official gazette each year.
   */
  readonly holidays: Readonly<Record<number, readonly HolidayDefault[]>>;
  readonly payroll: PayrollRules;
}
