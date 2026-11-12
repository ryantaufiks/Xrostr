import { z } from 'zod';

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});
export type PushSubscriptionRequest = z.infer<typeof pushSubscriptionSchema>;

export const unsubscribePushSchema = z.object({ endpoint: z.url().max(2048) });
export type UnsubscribePushRequest = z.infer<typeof unsubscribePushSchema>;

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationInbox {
  unread: number;
  items: NotificationView[];
}

/** Payload the worker pushes and the service worker displays. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** Safety messages (SOS, alerts, welfare checks) stay on screen and vibrate until handled. */
  urgent?: boolean;
}

/** Notification kinds that must not be missed: they stay on screen and vibrate. */
export const isUrgentNotification = (kind: string) =>
  kind.startsWith('alert.') || kind === 'welfare.check';
