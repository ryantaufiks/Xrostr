import type { AccountStatus, EmployeeStatus, EmploymentType } from '@xrostr/contracts';
import { workforce } from './i18n/messages/workforce';
import { currentLocale } from './i18n/state';

const texts = () => workforce[currentLocale()];

export interface LegalEntityOption {
  id: string;
  name: string;
  countryCode: string;
  defaultTimezone: string;
  timezones: string[];
}

export const TIMEZONE_LABELS: Record<string, string> = {
  'Asia/Jakarta': 'WIB (Asia/Jakarta)',
  'Asia/Makassar': 'WITA (Asia/Makassar)',
  'Asia/Jayapura': 'WIT (Asia/Jayapura)',
  'Asia/Singapore': 'SGT (Asia/Singapore)',
};

export const roleLabel = (role: string | null) => (role ? (texts().roles[role] ?? role) : '—');

export const employmentLabel = (type: EmploymentType) => texts().employment[type] ?? type;

/** One status line for a person: their HR status first, then whether they can sign in. */
export function personStatus(
  status: EmployeeStatus,
  account: AccountStatus,
): { label: string; tone: 'active' | 'warn' | 'neutral' } {
  if (status === 'inactive') return { label: texts().statusInactive, tone: 'neutral' };
  if (account === 'invited') return { label: texts().statusInvited, tone: 'warn' };
  if (account === 'disabled') return { label: texts().statusBlocked, tone: 'warn' };
  return { label: texts().statusActive, tone: 'active' };
}

/** Maps API validation paths to friendly messages for the forms. */
export function fieldErrors(errors: { path: string; message: string }[]): Record<string, string> {
  return Object.fromEntries(errors.map((e) => [e.path, texts().fields[e.path] ?? e.message]));
}
