'use client';

import type { CheckinCode } from '@xrostr/contracts';
import { Printer, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert, Button, Card, buttonStyles } from './ui';

/** The site's check-in QR: preview, printable poster, and rotation to void old posters. */
export function SiteQrCard({ locationId, hasPoint }: { locationId: string; hasPoint: boolean }) {
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
          text: e instanceof ApiError ? e.message : 'Terjadi kesalahan.',
        }),
      );
  }, [locationId]);

  async function rotate() {
    if (
      !window.confirm(
        'Ganti kode QR? Poster yang sudah tertempel langsung tidak berlaku dan harus dicetak ulang.',
      )
    )
      return;
    setRotating(true);
    setMessage(null);
    try {
      await show(
        await api<CheckinCode>(`/tenant/locations/${locationId}/checkin-code/rotate`, {
          method: 'POST',
        }),
      );
      setMessage({ tone: 'success', text: 'Kode QR diganti. Cetak dan tempel poster baru.' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof ApiError ? e.message : 'Terjadi kesalahan.' });
    } finally {
      setRotating(false);
    }
  }

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="label font-bold text-fg">QR absensi</h2>
        <p className="mt-1 text-sm text-muted">
          Tempel poster ini di pos jaga. Officer memindainya untuk absen masuk dan pulang.
        </p>
      </div>
      {!hasPoint && (
        <Alert>
          Isi titik lokasi site terlebih dahulu; tanpa titik, absensi tidak bisa diterima.
        </Alert>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {image && (
        <img src={image} alt="QR absensi site" className="size-60 rounded-xl bg-white p-3" />
      )}
      <div className="flex flex-wrap gap-2">
        <Link href={`/tenant/locations/${locationId}/poster`} className={buttonStyles('primary')}>
          <Printer className="size-5" aria-hidden />
          Cetak poster
        </Link>
        <Button variant="secondary" loading={rotating} onClick={rotate}>
          <RefreshCw className="size-5" aria-hidden />
          Ganti kode QR
        </Button>
      </div>
    </Card>
  );
}
