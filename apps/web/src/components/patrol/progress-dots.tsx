import { cx } from '../ui';

/** One dot per checkpoint, filled once scanned: readable at a glance, in the dot-matrix style. */
export function ProgressDots({
  scanned,
  total,
  className,
}: {
  scanned: number;
  total: number;
  className?: string;
}) {
  return (
    <div className={cx('mt-6 flex flex-wrap justify-center gap-2', className)} aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cx('size-3.5 rounded-full', i < scanned ? 'bg-fg' : 'border border-control')}
        />
      ))}
    </div>
  );
}
