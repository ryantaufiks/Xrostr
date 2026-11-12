'use client';

import type { CheckinCode, LocationView } from '@xrostr/contracts';
import { Printer } from 'lucide-react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/brand';
import { Alert, Button, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useData } from '@/lib/use-data';
import { useT } from '@/lib/i18n';

/** A4 poster for the guard post. The app chrome is hidden when printing. */
export default function PosterPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const sites = useData<LocationView[]>('/tenant/locations');
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const site = sites.data?.find((s) => s.id === id);

  useEffect(() => {
    api<CheckinCode>(`/tenant/locations/${id}/checkin-code`)
      .then((code) =>
        QRCode.toDataURL(`${window.location.origin}${code.path}`, {
          margin: 2,
          width: 900,
          errorCorrectionLevel: 'M',
        }),
      )
      .then(setImage)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : t.common.error));
  }, [id]);

  if (error ?? sites.error) return <Alert>{error ?? sites.error}</Alert>;
  if (!image || !site) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="size-5" aria-hidden />
          {t.sites.print}
        </Button>
      </div>
      {/* Always black on white, whatever the screen theme, so it prints cleanly. */}
      <section
        className="poster mx-auto flex max-w-xl flex-col items-center gap-6 rounded-2xl bg-white p-10 text-center text-black"
        // Theme colours are redefined here so the logo prints black whatever the screen theme.
        style={{ ['--fg' as string]: '#0b0b0b' }}
      >
        <Logo />
        <h1 className="text-4xl font-bold">{site.name}</h1>
        <p className="font-mono text-xl">{site.code}</p>
        <img src={image} alt={t.sites.posterAlt(site.name)} className="w-full max-w-md" />
        <p className="text-2xl font-semibold">{t.sites.posterScan}</p>
        <p className="text-lg">{t.sites.posterHow}</p>
      </section>
    </div>
  );
}
