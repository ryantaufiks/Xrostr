import type { LeaveRequestView, LeaveStatus } from '@xrostr/contracts';

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  cancelled: 'Dibatalkan',
};

const shortDate = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const fmt = (date: string) => shortDate.format(new Date(`${date}T00:00:00Z`));

/** "Kam, 24 Des – Sab, 26 Des" */
export const leaveRange = (r: Pick<LeaveRequestView, 'startDate' | 'endDate'>) =>
  r.startDate === r.endDate ? fmt(r.startDate) : `${fmt(r.startDate)} – ${fmt(r.endDate)}`;
