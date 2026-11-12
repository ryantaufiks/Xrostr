'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { logout } from '@/lib/session';
import { Logo } from './brand';
import { cx, Dot } from './ui';

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
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="text-fg">
            <Logo />
          </Link>
          <span className="label hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-muted sm:inline-flex">
            <Dot />
            {areaLabel}
          </span>
          <nav className="flex flex-1 gap-4">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  'label border-b-2 px-1 py-1',
                  pathname.startsWith(item.href)
                    ? 'border-fg text-fg'
                    : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="label inline-flex items-center gap-1.5 text-muted hover:text-fg"
          >
            <LogOut className="size-4" aria-hidden />
            Keluar
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</main>
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
    <div className="dot-grid flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center text-fg">
          <Logo />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="label mt-6 text-center text-faint">
          Xrostr · HRMS otonom untuk tenaga kerja shift
        </p>
      </div>
    </div>
  );
}
