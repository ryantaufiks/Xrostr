'use client';

import { api } from './api';

/** Chrome/Edge/Android fire this when the app can be installed; we keep it for our button. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((l) => l());
  });
}

export function onInstallAvailabilityChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const canPromptInstall = () => deferredPrompt !== null;

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  listeners.forEach((l) => l());
  return outcome === 'accepted';
}

export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export type PushState =
  'unsupported' | 'ios-install-first' | 'denied' | 'off' | 'on' | 'not-configured';

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration('/')) ?? null;
}

export async function pushState(): Promise<PushState> {
  // iOS only offers Web Push to apps added to the Home Screen.
  if (isIos() && !isInstalled()) return 'ios-install-first';
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  if (!reg) return 'unsupported';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

export async function enablePush(): Promise<PushState> {
  const { publicKey } = await api<{ publicKey: string | null }>('/notifications/push/public-key');
  if (!publicKey) return 'not-configured';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = (await registration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  });
  const json = subscription.toJSON();
  await api('/notifications/push/subscriptions', {
    body: { endpoint: json.endpoint, keys: json.keys },
  });
  return 'on';
}

/**
 * Re-sends this device's subscription for the signed-in user. Keeps the server in step if it
 * lost the record, and moves a shared device to whoever signed in last.
 */
export async function syncPush(): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (!subscription) return;
  const json = subscription.toJSON();
  await api('/notifications/push/subscriptions', {
    body: { endpoint: json.endpoint, keys: json.keys },
  }).catch(() => undefined);
}

/**
 * Called on sign-out: the next person on this device must not receive this user's
 * notifications, so the subscription is detached on the server and in the browser.
 */
export async function releasePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (!subscription) return;
  await api('/notifications/push/subscriptions', {
    method: 'DELETE',
    body: { endpoint: subscription.endpoint },
  }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}

export async function disablePush(): Promise<PushState> {
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (subscription) {
    await api('/notifications/push/subscriptions', {
      method: 'DELETE',
      body: { endpoint: subscription.endpoint },
    });
    await subscription.unsubscribe();
  }
  return 'off';
}
