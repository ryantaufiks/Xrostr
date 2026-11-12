import { Loader2 } from 'lucide-react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-fg text-bg hover:opacity-85 disabled:opacity-40',
  secondary: 'border border-control text-fg hover:border-fg disabled:text-faint',
  ghost: 'text-muted hover:text-fg',
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
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button className={buttonStyles(variant, className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="size-5 animate-spin" aria-hidden />}
      {children}
    </button>
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

export function Spinner({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div className="label flex items-center justify-center gap-2 py-16 text-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
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
