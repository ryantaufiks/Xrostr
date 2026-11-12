'use client';

import type { NotificationInbox } from '@xrostr/contracts';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { syncPush } from '@/lib/pwa';
import { iconButtonStyles } from './ui';

const REFRESH_MS = 60_000;

/** Header bell with the unread count; refreshes every minute and when the app regains focus. */
export function NotificationBell({ href }: { href: string }) {
  const t = useT();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => void syncPush(), []);

  useEffect(() => {
    let active = true;
    const load = () =>
      api<NotificationInbox>('/notifications')
        .then((inbox) => active && setUnread(inbox.unread))
        .catch(() => undefined);
    load();
    const timer = setInterval(load, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pathname]);

  const label = unread > 0 ? t.common.notificationsUnread(unread) : t.common.notifications;
  return (
    <Link href={href} aria-label={label} className={iconButtonStyles('sm', 'neutral', 'relative')}>
      <Bell className="size-6" aria-hidden />
      {unread > 0 && (
        <span className="absolute top-1 right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1 font-mono text-xs leading-5 font-bold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
