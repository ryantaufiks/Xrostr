'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { logout } from '@/lib/session';
import { Logo } from './brand';
import { cx } from './ui';

export interface NavItem {
  href: string;
  label: string;
}

/** Signed-in layout: top bar with the area name, navigation and sign-out. */
export function AppShell({
  areaLabel,
  nav,
  children,
}: {
  areaLabel: string;
  nav: NavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await logout();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="text-ink-900">
            <Logo />
          </Link>
          <span className="hidden rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600 sm:inline">
            {areaLabel}
          </span>
          <nav className="flex flex-1 gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  'rounded-md px-3 py-1.5 text-sm font-medium',
                  pathname.startsWith(item.href)
                    ? 'bg-ink-100 text-ink-900'
                    : 'text-ink-500 hover:text-ink-900',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-500 hover:bg-ink-100 hover:text-ink-900"
          >
            <LogOut className="size-4" aria-hidden />
            Keluar
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
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
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center text-ink-900">
          <Logo />
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-ink-200/70 sm:p-8">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-xs text-ink-400">
          Xrostr · HRMS otonom untuk tenaga kerja shift
        </p>
      </div>
    </div>
  );
}
