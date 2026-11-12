'use client';

import { Ellipsis, LogOut, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { logout } from '@/lib/session';
import { Logo } from './brand';
import { LanguageSwitch } from './language-switch';
import { cx, Dot } from './ui';

export interface NavItem {
  href: string;
  label: string;
  /** Shown in the bottom tab bar on phones. */
  icon: LucideIcon;
}

const MAX_TABS = 5;
const TAB = 'flex min-h-16 flex-col items-center justify-center gap-1 text-[13px] font-semibold';

/**
 * Signed-in layout. Wide screens: navigation in the top bar. Phones: a bottom tab bar with
 * large icon-and-label targets within thumb reach, as in a native app.
 */
export function AppShell({
  areaLabel,
  nav,
  actions,
  children,
}: {
  areaLabel: string;
  nav: NavItem[];
  /** Extra header controls before sign-out, such as the notification bell. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);
  // The most specific match wins, so /tenant/account does not also light up /tenant.
  const activeHref = nav
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((x, y) => y.href.length - x.href.length)[0]?.href;
  // Five large tabs fit a phone; beyond that the rest go under "Lainnya".
  const tabs = nav.length > MAX_TABS ? nav.slice(0, MAX_TABS - 1) : nav;
  const more = nav.slice(tabs.length);
  const moreActive = more.some((item) => item.href === activeHref);

  async function signOut() {
    setSigningOut(true);
    await logout();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
          <Link href="/" className="text-fg" aria-label={t.common.home}>
            <Logo compact />
          </Link>
          <span className="label hidden items-center gap-1.5 rounded-full border border-control px-3 py-1 text-muted md:inline-flex">
            <Dot />
            {areaLabel}
          </span>
          <nav className="hidden flex-1 gap-4 sm:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  'label inline-flex min-h-11 items-center border-b-2 px-2 font-bold',
                  item.href === activeHref
                    ? 'border-fg text-fg'
                    : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex-1 sm:hidden" />
          {actions}
          <button
            onClick={signOut}
            disabled={signingOut}
            aria-label={t.common.signOut}
            className="label inline-flex min-h-11 items-center gap-2 px-2 font-bold text-muted hover:text-fg"
          >
            <LogOut className="size-5" aria-hidden />
            <span className="hidden sm:inline">{t.common.signOut}</span>
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-8 pb-32 sm:px-6 sm:py-10">{children}</main>
      {moreOpen && (
        <div
          className="fixed inset-0 z-10 sm:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden
        />
      )}
      <nav
        aria-label={t.common.mainMenu}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {moreOpen && (
          <ul id="more-menu" className="border-b border-line">
            {more.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={href === activeHref ? 'page' : undefined}
                  className={cx(
                    'flex min-h-14 items-center gap-4 px-6 text-lg font-semibold',
                    href === activeHref ? 'text-fg' : 'text-muted',
                  )}
                >
                  <Icon className="size-6" aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${tabs.length + (more.length ? 1 : 0)}, minmax(0, 1fr))`,
          }}
        >
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = href === activeHref;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cx(TAB, active ? 'text-fg' : 'text-muted')}
              >
                <Icon className="size-6" aria-hidden strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            );
          })}
          {more.length > 0 && (
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="more-menu"
              onClick={() => setMoreOpen((open) => !open)}
              className={cx(TAB, moreActive || moreOpen ? 'text-fg' : 'text-muted')}
            >
              <Ellipsis className="size-6" aria-hidden strokeWidth={moreActive ? 2.4 : 1.8} />
              {t.common.more}
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}

/** Centered card layout for sign-in, 2FA and invitation pages. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="dot-grid relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <LanguageSwitch className="absolute top-4 right-4" />
      <div className="w-full max-w-lg">
        <div className="mb-8 flex justify-center text-fg">
          <Logo />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-base text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="label mt-6 text-center text-faint">{t.common.tagline}</p>
      </div>
    </div>
  );
}
