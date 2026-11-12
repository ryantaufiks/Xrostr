import type { AccountStatus, EmployeeStatus, EmploymentType } from '@xrostr/contracts';
import { ROLE_LABELS } from '@xrostr/contracts';

export interface LegalEntityOption {
  id: string;
  name: string;
  countryCode: string;
  defaultTimezone: string;
  timezones: string[];
}

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: 'Penuh waktu',
  part_time: 'Paruh waktu',
};

export const TIMEZONE_LABELS: Record<string, string> = {
  'Asia/Jakarta': 'WIB (Asia/Jakarta)',
  'Asia/Makassar': 'WITA (Asia/Makassar)',
  'Asia/Jayapura': 'WIT (Asia/Jayapura)',
  'Asia/Singapore': 'SGT (Asia/Singapore)',
};

export const roleLabel = (role: string | null) =>
  role ? (ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role) : '—';

/** One status line for a person: their HR status first, then whether they can sign in. */
export function personStatus(
  status: EmployeeStatus,
  account: AccountStatus,
): { label: string; tone: 'active' | 'warn' | 'neutral' } {
  if (status === 'inactive') return { label: 'Nonaktif', tone: 'neutral' };
  if (account === 'invited') return { label: 'Belum aktivasi', tone: 'warn' };
  if (account === 'disabled') return { label: 'Akses diblokir', tone: 'warn' };
  return { label: 'Aktif', tone: 'active' };
}

/** Maps API validation paths to Indonesian messages for the forms. */
export function fieldErrors(errors: { path: string; message: string }[]): Record<string, string> {
  return Object.fromEntries(errors.map((e) => [e.path, FIELD_MESSAGES[e.path] ?? e.message]));
}

const FIELD_MESSAGES: Record<string, string> = {
  code: 'Gunakan maksimal 20 huruf, angka, atau tanda hubung.',
  phone: 'Gunakan angka, boleh diawali +, misalnya +62812345678.',
  email: 'Format email tidak valid.',
  longitude: 'Isi latitude dan longitude bersamaan.',
  startDate: 'Pilih tanggal mulai kerja.',
};
