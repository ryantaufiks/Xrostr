'use client';

import type { CheckinCode } from '@xrostr/contracts';
import { Printer, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useConfirm } from './confirm-dialog';
import { Alert, Button, Card, buttonStyles } from './ui';
import { useT } from '@/lib/i18n';

/** The site's check-in QR: preview, printable poster, and rotation to void old posters. */
export function SiteQrCard({ locationId, hasPoint }: { locationId: string; hasPoint: boolean }) {
  const t = useT();
  const { confirm, confirmDialog } = useConfirm();
  const [image, setImage] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [rotating, setRotating] = useState(false);

  async function show(code: CheckinCode) {
    setImage(
      await QRCode.toDataURL(`${window.location.origin}${code.path}`, { margin: 1, width: 240 }),
    );
  }

  useEffect(() => {
    api<CheckinCode>(`/tenant/locations/${locationId}/checkin-code`)
      .then(show)
      .catch((e: unknown) =>
        setMessage({
          tone: 'error',
          text: e instanceof ApiError ? e.message : t.common.error,
        }),
      );
  }, [locationId]);

  async function rotate() {
    if (!(await confirm({ message: t.sites.rotateConfirm, confirmLabel: t.sites.rotate }))) return;
    setRotating(true);
    setMessage(null);
    try {
      await show(
        await api<CheckinCode>(`/tenant/locations/${locationId}/checkin-code/rotate`, {
          method: 'POST',
        }),
      );
      setMessage({ tone: 'success', text: t.sites.rotated });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof ApiError ? e.message : t.common.error });
    } finally {
      setRotating(false);
    }
  }

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      {confirmDialog}
      <div>
        <h2 className="label font-bold text-fg">{t.sites.qrTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.sites.qrHint}</p>
      </div>
      {!hasPoint && <Alert>{t.sites.qrNoPoint}</Alert>}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {image && (
        <img src={image} alt={t.sites.qrTitle} className="size-60 rounded-xl bg-white p-3" />
      )}
      <div className="flex flex-wrap gap-2">
        <Link href={`/tenant/locations/${locationId}/poster`} className={buttonStyles('primary')}>
          <Printer className="size-5" aria-hidden />
          {t.sites.printPoster}
        </Link>
        <Button variant="secondary" loading={rotating} onClick={rotate}>
          <RefreshCw className="size-5" aria-hidden />
          {t.sites.rotate}
        </Button>
      </div>
    </Card>
  );
}
