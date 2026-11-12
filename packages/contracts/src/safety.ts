import { z } from 'zod';

export const ALERT_KINDS = ['sos', 'welfare_missed', 'patrol_overdue'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_STATUSES = ['open', 'acknowledged', 'resolved'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

/** Minutes an officer has to answer a welfare check before supervisors are alerted. */
export const WELFARE_RESPONSE_MINUTES = 10;

const position = {
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).max(10_000).optional(),
};
const together = (v: { latitude?: number; longitude?: number }) =>
  (v.latitude === undefined) === (v.longitude === undefined);
const togetherMessage = { path: ['longitude'], message: 'Give latitude and longitude together' };

/** Sent from the officer's phone; the position is attached when the phone can give one. */
export const raiseSosSchema = z
  .object({ ...position, note: z.string().trim().max(300).optional() })
  .refine(together, togetherMessage);
export type RaiseSosRequest = z.infer<typeof raiseSosSchema>;

export const respondWelfareSchema = z.object(position).refine(together, togetherMessage);
export type RespondWelfareRequest = z.infer<typeof respondWelfareSchema>;

export const resolveAlertSchema = z.object({ note: z.string().trim().max(500).optional() });
export type ResolveAlertRequest = z.infer<typeof resolveAlertSchema>;

/** `open` lists everything still needing attention: open and acknowledged alerts. */
export const alertsQuerySchema = z.object({ status: z.enum(['open', 'all']).default('open') });
export type AlertsQuery = z.infer<typeof alertsQuerySchema>;

export interface AlertView {
  id: string;
  kind: AlertKind;
  status: AlertStatus;
  employee: { id: string; fullName: string; employeeNo: string; phone: string | null };
  location: { id: string; name: string; timezone: string } | null;
  route: { id: string; name: string } | null;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  note: string | null;
  raisedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
}

export interface WelfareCheckView {
  id: string;
  promptedAt: string;
  respondBy: string;
  respondedAt: string | null;
}

/** The officer's safety screen: an unanswered welfare check, and their latest unresolved SOS. */
export interface MySafety {
  check: WelfareCheckView | null;
  sos: AlertView | null;
}
