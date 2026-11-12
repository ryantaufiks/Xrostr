import type { LeaveRequestView } from '@xrostr/contracts';
import { intlLocale } from './i18n/state';

const fmt = (date: string) =>
  new Intl.DateTimeFormat(intlLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

/** "Kam, 24 Des – Sab, 26 Des" / "Thu, 24 Dec – Sat, 26 Dec" */
export const leaveRange = (r: Pick<LeaveRequestView, 'startDate' | 'endDate'>) =>
  r.startDate === r.endDate ? fmt(r.startDate) : `${fmt(r.startDate)} – ${fmt(r.endDate)}`;
