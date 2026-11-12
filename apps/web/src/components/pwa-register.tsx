'use client';

import { useEffect } from 'react';
import { captureInstallPrompt } from '@/lib/pwa';
import { syncThemeColor } from '@/lib/theme';

/** Registers the service worker that makes Xrostr installable and receives push messages. */
export function PwaRegister() {
  useEffect(() => {
    captureInstallPrompt();
    syncThemeColor();
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
