'use client';

import { Siren } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';
import { cx } from '../ui';

const HOLD_MS = 2_000;

/**
 * Press and hold to send: the ring fills over two seconds and letting go early cancels, so an
 * SOS is never sent from a pocket. Works with touch, mouse and the keyboard (hold Space/Enter).
 */
export function SosButton({ onTrigger, busy }: { onTrigger: () => void; busy: boolean }) {
  const t = useT();
  const [progress, setProgress] = useState(0);
  const started = useRef<number | null>(null);
  const frame = useRef(0);

  const stop = () => {
    started.current = null;
    cancelAnimationFrame(frame.current);
    setProgress(0);
  };
  const start = () => {
    if (busy || started.current !== null) return;
    started.current = performance.now();
    const step = () => {
      if (started.current === null) return;
      const done = Math.min(1, (performance.now() - started.current) / HOLD_MS);
      setProgress(done);
      if (done >= 1) {
        stop();
        if ('vibrate' in navigator) navigator.vibrate(200);
        onTrigger();
      } else frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <button
      type="button"
      disabled={busy}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && start()}
      onKeyUp={stop}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={t.safety.sosHold}
      className={cx(
        'relative flex size-40 touch-none flex-col items-center justify-center gap-1 rounded-full border-4 border-accent font-display text-3xl font-black text-accent select-none',
        busy && 'opacity-50',
      )}
      style={{
        background: `conic-gradient(var(--accent) ${progress * 360}deg, transparent 0deg)`,
      }}
    >
      <span className="flex size-32 flex-col items-center justify-center rounded-full bg-bg">
        <Siren className="size-10" aria-hidden />
        SOS
      </span>
    </button>
  );
}
