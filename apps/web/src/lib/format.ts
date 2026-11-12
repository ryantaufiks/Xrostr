import { intlLocale } from './i18n/state';

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'medium' }).format(new Date(iso));
export const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  growth: 'Growth',
  enterprise: 'Enterprise',
};

/** "Garda Aman Pte. Ltd." → "garda-aman-pte-ltd" */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}
