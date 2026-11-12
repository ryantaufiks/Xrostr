'use client';

import type { PatrolRouteView, PatrolTag } from '@xrostr/contracts';
import { Check, Copy, Nfc, Printer, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
import { Logo } from '@/components/brand';
import { Alert, Button, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';

interface NdefWriter {
  write(message: { records: { recordType: 'url'; data: string }[] }): Promise<void>;
}

/** Web NFC exists in Chrome on Android only; elsewhere the link is copied into an NFC app. */
const ndefWriter = (): NdefWriter | null => {
  const Ctor = (window as unknown as { NDEFReader?: new () => NdefWriter }).NDEFReader;
  return Ctor ? new Ctor() : null;
};

type Tag = PatrolTag & { url: string; image: string };

/** Printable QR tags for a route's checkpoints, with the same links ready for NFC stickers. */
export default function PatrolTagsPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const [route, setRoute] = useState<PatrolRouteView | null>(null);
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [nfc, setNfc] = useState(false);

  const withImage = useCallback(async (tag: PatrolTag): Promise<Tag> => {
    const url = `${window.location.origin}${tag.path}`;
    const image = await QRCode.toDataURL(url, { margin: 2, width: 600, errorCorrectionLevel: 'M' });
    return { ...tag, url, image };
  }, []);

  useEffect(() => {
    setNfc(ndefWriter() !== null);
    Promise.all([
      api<PatrolRouteView>(`/tenant/patrol/routes/${id}`),
      api<PatrolTag[]>(`/tenant/patrol/routes/${id}/tags`),
    ])
      .then(async ([r, list]) => {
        setRoute(r);
        setTags(await Promise.all(list.map(withImage)));
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : t.common.error));
  }, [id, t, withImage]);

  async function copy(tag: Tag) {
    await navigator.clipboard.writeText(tag.url);
    setCopied(tag.checkpointId);
    setTimeout(() => setCopied(null), 2000);
  }

  async function writeNfc(tag: Tag) {
    const writer = ndefWriter();
    if (!writer) return;
    setMessage({ tone: 'success', text: t.patrol.nfcHold });
    try {
      await writer.write({ records: [{ recordType: 'url', data: tag.url }] });
      setMessage({ tone: 'success', text: t.patrol.nfcDone });
    } catch {
      setMessage({ tone: 'error', text: t.patrol.nfcFailed });
    }
  }

  async function rotate(tag: Tag) {
    if (!confirm(t.patrol.rotateConfirm(tag.name))) return;
    try {
      const fresh = await withImage(
        await api<PatrolTag>(`/tenant/patrol/checkpoints/${tag.checkpointId}/tag/rotate`, {
          method: 'POST',
        }),
      );
      setTags(
        (list) => list?.map((x) => (x.checkpointId === fresh.checkpointId ? fresh : x)) ?? null,
      );
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof ApiError ? e.message : t.common.error });
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!route || !tags) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="space-y-4 print:hidden">
        <PageHeader
          title={t.patrol.tagsTitle(route.name)}
          description={t.patrol.tagsHint}
          actions={
            <Button onClick={() => window.print()}>
              <Printer className="size-5" aria-hidden />
              {t.patrol.print}
            </Button>
          }
        />
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 print:grid-cols-2 print:gap-4">
        {tags.map((tag) => (
          <div key={tag.checkpointId} className="space-y-3 break-inside-avoid">
            {/* Always black on white, whatever the screen theme, so it prints cleanly. */}
            <section
              className="poster flex flex-col items-center gap-3 rounded-2xl bg-white p-6 text-center text-black"
              style={{ ['--fg' as string]: '#0b0b0b' }}
            >
              <Logo />
              <p className="font-mono text-sm">
                {route.location.code} · {tag.position}
              </p>
              <h2 className="text-2xl font-bold">{tag.name}</h2>
              <img src={tag.image} alt={t.patrol.tagAlt(tag.name)} className="w-full max-w-60" />
              <p className="text-lg font-semibold">{t.patrol.tagScan}</p>
            </section>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button type="button" variant="secondary" onClick={() => copy(tag)}>
                {copied === tag.checkpointId ? (
                  <Check className="size-5" aria-hidden />
                ) : (
                  <Copy className="size-5" aria-hidden />
                )}
                {copied === tag.checkpointId ? t.patrol.copied : t.patrol.copyLink}
              </Button>
              {nfc && (
                <Button type="button" variant="secondary" onClick={() => writeNfc(tag)}>
                  <Nfc className="size-5" aria-hidden />
                  {t.patrol.writeNfc}
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={() => rotate(tag)}>
                <RefreshCw className="size-5" aria-hidden />
                {t.patrol.rotateTag}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
