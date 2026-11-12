export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-ink-900" />
        <path
          d="M9 9l14 14M23 9L9 23"
          className="stroke-brand-400"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight">Xrostr</span>
    </span>
  );
}
