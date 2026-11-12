'use client';

import { BellOff, BellRing, Download, Send, Share, SquarePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
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

/** Install the app and turn device notifications on or off. Tenant users only. */
export function AppCard() {
  const t = useT();
  const pushMessages: Partial<Record<PushState, string>> = {
    unsupported: t.account.pushUnsupported,
    denied: t.account.pushDenied,
    'not-configured': t.account.pushNotConfigured,
  };
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
        text: e instanceof ApiError ? e.message : t.account.pushFailed,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountSection title={t.account.appTitle} description={t.account.appDescription}>
      <div className="max-w-md space-y-6">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        <div className="space-y-3">
          <p className="label flex items-center gap-2 font-bold text-fg">
            <Dot tone={installed ? 'fg' : 'accent'} />
            {installed ? t.account.installed : t.account.notInstalled}
          </p>
          {!installed && installable && (
            <Button type="button" onClick={() => run(async () => void (await promptInstall()))}>
              <Download className="size-5" aria-hidden />
              {t.account.install}
            </Button>
          )}
          {!installed && ios && (
            <ol className="list-decimal space-y-2 pl-5 text-base text-muted">
              <li>
                {t.account.iosTap}{' '}
                <Share
                  className="inline size-5 align-text-bottom"
                  aria-label={t.account.iosShare}
                />{' '}
                {t.account.iosInSafari}
              </li>
              <li>
                {t.account.iosChoose}{' '}
                <SquarePlus className="inline size-5 align-text-bottom" aria-hidden />{' '}
                <strong className="text-fg">{t.account.iosAddToHome}</strong>.
              </li>
              <li>{t.account.iosOpen}</li>
            </ol>
          )}
          {!installed && !installable && !ios && (
            <p className="text-base text-muted">
              {t.account.browserMenu}{' '}
              <strong className="text-fg">{t.account.browserInstall}</strong> {t.account.or}{' '}
              <strong className="text-fg">{t.account.browserAddHome}</strong>.
            </p>
          )}
        </div>

        <div className="space-y-3 border-t border-line pt-6">
          <p className="label flex items-center gap-2 font-bold text-fg">
            <Dot tone={push === 'on' ? 'fg' : 'accent'} />
            {push === 'on' ? t.account.pushOn : t.account.pushOff}
          </p>
          {push && pushMessages[push] && (
            <p className="text-base text-muted">{pushMessages[push]}</p>
          )}
          {push === 'ios-install-first' && (
            <p className="text-base text-muted">{t.account.iosInstallFirst}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {push === 'off' && (
              <Button
                type="button"
                loading={busy}
                onClick={() => run(async () => setPush(await enablePush()))}
              >
                <BellRing className="size-5" aria-hidden />
                {t.account.enablePush}
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
                        text: t.account.testSent,
                      });
                    })
                  }
                >
                  <Send className="size-5" aria-hidden />
                  {t.account.sendTest}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => run(async () => setPush(await disablePush()))}
                >
                  <BellOff className="size-5" aria-hidden />
                  {t.account.turnOff}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </AccountSection>
  );
}
