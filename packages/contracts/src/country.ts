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
  readonly name: string;
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
}
