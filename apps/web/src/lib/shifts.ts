import type { ShiftKind, ShiftView } from '@xrostr/contracts';

export const SHIFT_LABELS: Record<ShiftKind, string> = {
  day: 'Shift pagi',
  night: 'Shift malam',
  custom: 'Shift khusus',
};

/** "20.00–08.00" in Indonesian notation. */
export const shiftHours = (s: Pick<ShiftView, 'localStart' | 'localEnd'>) =>
  `${s.localStart.replace(':', '.')}–${s.localEnd.replace(':', '.')}`;
