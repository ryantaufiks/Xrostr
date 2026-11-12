const dateTime = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => date.format(new Date(iso));

export const COUNTRY_LABELS: Record<string, string> = { SG: 'Singapura', ID: 'Indonesia' };
export const REGION_LABELS: Record<string, string> = { sg: 'Singapura', id: 'Indonesia' };
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
