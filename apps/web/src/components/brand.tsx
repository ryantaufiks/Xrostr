// A 5×5 dot matrix drawing an X; the centre dot carries the accent.
const DOTS: [number, number][] = [
  [0, 0],
  [4, 0],
  [1, 1],
  [3, 1],
  [1, 3],
  [3, 3],
  [0, 4],
  [4, 4],
];

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 22 22" className="size-6" aria-hidden>
        {DOTS.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={3 + x * 4} cy={3 + y * 4} r="1.7" className="fill-fg" />
        ))}
        <circle cx="11" cy="11" r="1.7" className="fill-accent" />
      </svg>
      <span className="font-display text-xl font-black tracking-wide uppercase">Xrostr</span>
    </span>
  );
}
