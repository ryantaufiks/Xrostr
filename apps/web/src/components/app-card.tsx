'use client';

import { BellOff, BellRing, Download, Send, Share, SquarePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  canPromptInstall,
  disablePush,
  enablePush,
  isInstalled,
  isIos,
  onInstallAvailabilityChange,
  promptInstall,
  pushState,
  type PushState,
} from '@/lib/pwa';
import { AccountSection } from './account-section';
import { Alert, Button, Dot } from './ui';

const PUSH_MESSAGES: Partial<Record<PushState, string>> = {
  unsupported:
    'Browser ini belum mendukung notifikasi. Gunakan Chrome, Edge, Firefox, atau Safari terbaru.',
  denied:
    'Notifikasi diblokir untuk Xrostr. Izinkan lewat pengaturan situs di browser, lalu muat ulang halaman ini.',
  'not-configured': 'Notifikasi belum diaktifkan oleh administrator sistem.',
};

/** Install the app and turn device notifications on or off. Tenant users only. */
export function AppCard() {
  const [installed, setInstalled] = useState(true);
  const [installable, setInstallable] = useState(false);
  const [ios, setIos] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    setInstalled(isInstalled());
    setIos(isIos());
    setInstallable(canPromptInstall());
    pushState().then(setPush);
    return onInstallAvailabilityChange(() => {
      setInstallable(canPromptInstall());
      setInstalled(isInstalled());
    });
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage({
        tone: 'error',
        text: e instanceof ApiError ? e.message : 'Gagal mengatur notifikasi. Coba lagi.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountSection
      title="Aplikasi & notifikasi"
      description="Pasang Xrostr di layar utama HP agar terbuka seperti aplikasi dan bisa menerima pemberitahuan jadwal."
    >
      <div className="max-w-md space-y-6">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        <div className="space-y-3">
          <p className="label flex items-center gap-2 font-bold text-fg">
            <Dot tone={installed ? 'fg' : 'accent'} />
            {installed ? 'Aplikasi terpasang' : 'Belum dipasang'}
          </p>
          {!installed && installable && (
            <Button type="button" onClick={() => run(async () => void (await promptInstall()))}>
              <Download className="size-5" aria-hidden />
              Pasang aplikasi
            </Button>
          )}
          {!installed && ios && (
            <ol className="list-decimal space-y-2 pl-5 text-base text-muted">
              <li>
                Ketuk tombol{' '}
                <Share className="inline size-5 align-text-bottom" aria-label="Bagikan" /> di
                Safari.
              </li>
              <li>
                Pilih <SquarePlus className="inline size-5 align-text-bottom" aria-hidden />{' '}
                <strong className="text-fg">Tambah ke Layar Utama</strong>.
              </li>
              <li>Buka Xrostr dari layar utama, lalu aktifkan notifikasi di sini.</li>
            </ol>
          )}
          {!installed && !installable && !ios && (
            <p className="text-base text-muted">
              Buka menu browser (⋮), lalu pilih <strong className="text-fg">Instal aplikasi</strong>{' '}
              atau <strong className="text-fg">Tambahkan ke layar utama</strong>.
            </p>
          )}
        </div>

        <div className="space-y-3 border-t border-line pt-6">
          <p className="label flex items-center gap-2 font-bold text-fg">
            <Dot tone={push === 'on' ? 'fg' : 'accent'} />
            {push === 'on' ? 'Notifikasi aktif di perangkat ini' : 'Notifikasi belum aktif'}
          </p>
          {push && PUSH_MESSAGES[push] && (
            <p className="text-base text-muted">{PUSH_MESSAGES[push]}</p>
          )}
          {push === 'ios-install-first' && (
            <p className="text-base text-muted">
              Di iPhone, pasang aplikasi dulu (langkah di atas).
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {push === 'off' && (
              <Button
                type="button"
                loading={busy}
                onClick={() => run(async () => setPush(await enablePush()))}
              >
                <BellRing className="size-5" aria-hidden />
                Aktifkan notifikasi
              </Button>
            )}
            {push === 'on' && (
              <>
                <Button
                  type="button"
                  loading={busy}
                  onClick={() =>
                    run(async () => {
                      await api('/notifications/test', { method: 'POST' });
                      setMessage({
                        tone: 'success',
                        text: 'Notifikasi uji dikirim. Seharusnya muncul dalam beberapa detik.',
                      });
                    })
                  }
                >
                  <Send className="size-5" aria-hidden />
                  Kirim notifikasi uji
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => run(async () => setPush(await disablePush()))}
                >
                  <BellOff className="size-5" aria-hidden />
                  Matikan
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </AccountSection>
  );
}
