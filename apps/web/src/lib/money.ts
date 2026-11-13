import { intlLocale } from './i18n/state';

/** "Rp 5.400.000" / "S$1,234.50" from an amount in the currency's minor unit. */
export function formatMoney(minor: number, currency: string, minorUnits: number): string {
  return new Intl.NumberFormat(intlLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: minorUnits,
    maximumFractionDigits: minorUnits,
  }).format(minor / 10 ** minorUnits);
}

/** Minor units → the number a person types ("5400000", "1234.5"). */
export const toMajorInput = (minor: number, minorUnits: number) => String(minor / 10 ** minorUnits);

/** What a person typed → minor units, or null when it is not an amount. */
export function fromMajorInput(text: string, minorUnits: number): number | null {
  const clean = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  return Math.round(Number(clean) * 10 ** minorUnits);
}

/** "11 j 30 m" style durations from minutes. */
export function formatMinutes(total: number, h: string, m: string): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} ${m}`;
  return minutes === 0 ? `${hours} ${h}` : `${hours} ${h} ${minutes} ${m}`;
}
