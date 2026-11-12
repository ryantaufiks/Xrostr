'use client';

import type { NotificationInbox, NotificationView } from '@xrostr/contracts';
import { BellOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Dot, PageHeader, Spinner, cx } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/lib/i18n';

export default function NotificationsPage() {
  const t = useT();
  const router = useRouter();
  const [inbox, setInbox] = useState<NotificationInbox | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<NotificationInbox>('/notifications')
        .then(setInbox)
        .catch((e: unknown) => setError(e instanceof ApiError ? e.message : t.common.error)),
    [],
  );
  useEffect(() => void load(), [load]);

  async function open(item: NotificationView) {
    if (!item.readAt)
      await api(`/notifications/${item.id}/read`, { method: 'POST' }).catch(() => undefined);
    if (item.url && item.url !== '/tenant/notifications') router.push(item.url);
    else void load();
  }

  async function readAll() {
    await api('/notifications/read-all', { method: 'POST' });
    void load();
  }

  return (
    <>
      <PageHeader
        title={t.common.notifications}
        description={inbox ? t.leave.notificationsUnread(inbox.unread) : undefined}
        actions={
          inbox && inbox.unread > 0 ? (
            <Button variant="secondary" onClick={readAll}>
              {t.leave.markAllRead}
            </Button>
          ) : undefined
        }
      />
      {error && <Alert>{error}</Alert>}
      {!inbox && !error && <Spinner />}
      {inbox?.items.length === 0 && (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <BellOff className="size-10 text-faint" aria-hidden />
          <h2 className="mt-4 font-display text-xl font-bold">{t.leave.noNotifications}</h2>
          <p className="mt-1 max-w-sm text-base text-muted">{t.leave.noNotificationsHint}</p>
        </Card>
      )}
      {inbox && inbox.items.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {inbox.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className="flex w-full gap-4 px-5 py-4 text-left hover:bg-sunken"
                >
                  <span className="mt-2.5">
                    <Dot tone={item.readAt ? 'faint' : 'accent'} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block text-lg text-fg', !item.readAt && 'font-semibold')}>
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-base text-muted">{item.body}</span>
                    <span className="mt-1 block text-sm text-faint">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
