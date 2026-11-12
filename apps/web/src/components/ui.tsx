'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
} from 'react';
import { useT } from '@/lib/i18n';

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type IconButtonSize = 'sm' | 'md';
type IconButtonTone = 'neutral' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-fg text-bg hover:opacity-85 disabled:opacity-40',
  secondary: 'border border-control text-fg hover:border-fg disabled:text-faint',
  ghost: 'text-muted hover:text-fg',
  // Destructive: the single accent, with the opposite surface for readable text in both themes.
  danger: 'bg-accent text-bg hover:opacity-85 disabled:opacity-40',
};

/** Button look for links that act as buttons. */
export function buttonStyles(variant: ButtonVariant = 'primary', className?: string): string {
  return cx(
    'label inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 font-bold transition disabled:cursor-not-allowed',
    BUTTON_VARIANTS[variant],
    className,
  );
}

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      className={buttonStyles(variant, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const ICON_BUTTON_SIZES: Record<IconButtonSize, string> = {
  sm: 'size-11',
  md: 'size-12',
};

const ICON_BUTTON_TONES: Record<IconButtonTone, string> = {
  neutral: 'text-muted hover:bg-sunken hover:text-fg',
  danger: 'text-muted hover:bg-sunken hover:text-accent',
};

/** Shared 44px/48px circular target for icon-only actions and links. */
export function iconButtonStyles(
  size: IconButtonSize = 'sm',
  tone: IconButtonTone = 'neutral',
  className?: string,
): string {
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40',
    ICON_BUTTON_SIZES[size],
    ICON_BUTTON_TONES[tone],
    className,
  );
}

export function IconButton({
  size = 'sm',
  tone = 'neutral',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: IconButtonSize;
  tone?: IconButtonTone;
}) {
  return (
    <button className={iconButtonStyles(size, tone, className)} {...props}>
      {children}
    </button>
  );
}

/** A capsule group for choices with one active state, such as modes or themes. */
export function SegmentedControl({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  const radios = () =>
    Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);

  // Roving tabindex: only the checked radio is in the Tab order; arrows move between them.
  useEffect(() => {
    for (const radio of radios()) {
      radio.tabIndex = radio.getAttribute('aria-checked') === 'true' ? 0 : -1;
    }
  });

  // Arrow keys move focus and select, matching the native radio-group behaviour.
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = radios();
    if (items.length < 2) return;
    const active = document.activeElement;
    const currentIndex = items.indexOf(active as HTMLButtonElement);
    const checkedIndex = items.findIndex((r) => r.getAttribute('aria-checked') === 'true');
    const from = currentIndex >= 0 ? currentIndex : checkedIndex >= 0 ? checkedIndex : 0;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (from + 1) % items.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (from - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    items[next]!.focus();
    items[next]!.click();
  }

  return (
    <div
      ref={ref}
      className={cx('gap-1 rounded-full border border-control p-1', className)}
      onKeyDown={onKeyDown}
      {...props}
    >
      {children}
    </div>
  );
}

export function segmentedOptionStyles(selected: boolean, size: 'sm' | 'md' = 'md'): string {
  return cx(
    'label inline-flex items-center justify-center gap-2 rounded-full px-3 font-bold transition',
    size === 'sm' ? 'min-h-9 min-w-11' : 'min-h-11',
    selected ? 'bg-fg text-bg' : 'text-muted hover:text-fg',
  );
}

/** Full-width choice inside a settings card; deliberately rectangular like a form field. */
export function selectableRowStyles(selected: boolean): string {
  return cx(
    'flex min-h-12 w-full items-center gap-3 rounded-lg border px-4 text-left text-base font-semibold transition',
    selected ? 'border-fg bg-fg text-bg' : 'border-control text-fg hover:border-fg',
  );
}

const CONTROL =
  'block h-12 w-full rounded-lg border border-control bg-transparent px-4 text-base text-fg placeholder:text-faint focus:border-fg focus:ring-1 focus:ring-fg focus:outline-none aria-invalid:border-accent aria-invalid:ring-1 aria-invalid:ring-accent';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(CONTROL, 'pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="label block font-bold text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-accent" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-sm text-muted">{hint}</p>
      )}
    </div>
  );
}

/** The single accent in the interface: a small flat dot marking state. */
export function Dot({ tone = 'accent' }: { tone?: 'accent' | 'fg' | 'faint' }) {
  const tones = { accent: 'bg-accent', fg: 'bg-fg', faint: 'bg-faint' };
  return (
    <span className={cx('inline-block size-2 shrink-0 rounded-full', tones[tone])} aria-hidden />
  );
}

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex gap-3 rounded-lg border px-4 py-3.5 text-base',
        tone === 'error' ? 'border-accent text-accent' : 'border-line text-fg',
      )}
    >
      <span className="mt-[10px]">
        <Dot tone={tone === 'error' ? 'accent' : 'fg'} />
      </span>
      <div>{children}</div>
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-2xl border border-line bg-surface', className)}>{children}</div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'active' | 'warn';
  children: ReactNode;
}) {
  return (
    <span className="label inline-flex items-center gap-1.5 rounded-full border border-control px-3 py-1 text-fg">
      {tone !== 'neutral' && <Dot tone={tone === 'active' ? 'fg' : 'accent'} />}
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="label flex items-center justify-center gap-2 py-16 text-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label ?? t.common.loading}
    </div>
  );
}

/** A shimmering placeholder block, used to build skeleton screens for lists and cards. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-sunken', className)} aria-hidden />;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-2 text-base text-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

/** Table head row styling shared by data tables. */
export const TABLE_HEAD = 'label border-b border-line text-muted';

export { cx };
