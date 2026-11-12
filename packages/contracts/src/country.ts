export const COUNTRY_CODES = ['SG', 'ID'] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export const DATA_REGIONS = ['sg', 'id'] as const;
export type DataRegion = (typeof DATA_REGIONS)[number];

/** Static metadata of a Country Pack. Statutory rules are versioned data, added in Phase 3. */
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
}
