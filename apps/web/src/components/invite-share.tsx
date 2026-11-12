'use client';

import { Check, Copy, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { Alert, Button, Input, buttonStyles } from './ui';

/** Shows a one-time invite link with copy and WhatsApp buttons. */
export function InviteShare({
  token,
  expiresAt,
  tenantSlug,
  name,
  phone,
}: {
  token: string;
  expiresAt: string;
  tenantSlug: string | null;
  name: string;
  phone?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const params = new URLSearchParams({ token });
  if (tenantSlug) params.set('tenant', tenantSlug);
  const link = `${window.location.origin}/invite?${params.toString()}`;
  const message = `Halo ${name}, akun Xrostr Anda sudah dibuat. Buka tautan ini untuk membuat password: ${link}`;
  // wa.me wants the number as bare digits with country code, e.g. 6281234567890.
  const digits = phone?.replace(/\D/g, '') ?? '';
  const whatsapp = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <Alert tone="success">
        Kirim tautan ini ke {name}. Hanya berlaku sekali, sampai{' '}
        <strong>{formatDateTime(expiresAt)}</strong>.
      </Alert>
      <Input
        readOnly
        value={link}
        className="font-mono text-sm"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex flex-wrap gap-2">
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonStyles('primary')}
        >
          <MessageCircle className="size-5" aria-hidden />
          Kirim lewat WhatsApp
        </a>
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? (
            <Check className="size-5" aria-hidden />
          ) : (
            <Copy className="size-5" aria-hidden />
          )}
          {copied ? 'Tersalin' : 'Salin tautan'}
        </Button>
      </div>
    </div>
  );
}
