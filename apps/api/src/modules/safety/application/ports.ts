import type { AlertKind, AlertStatus } from '@xrostr/contracts';

export interface Alert {
  id: string;
  kind: AlertKind;
  status: AlertStatus;
  employeeId: string;
  locationId: string | null;
  shiftId: string | null;
  routeId: string | null;
  welfareCheckId: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  note: string | null;
  raisedAt: Date;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
}

export type NewAlert = Pick<
  Alert,
  | 'kind'
  | 'employeeId'
  | 'locationId'
  | 'shiftId'
  | 'latitude'
  | 'longitude'
  | 'accuracyM'
  | 'note'
  | 'raisedAt'
>;

/** All methods require a tenant unit of work. */
export abstract class AlertRepository {
  abstract insert(alert: NewAlert): Promise<string>;
  abstract findById(id: string): Promise<Alert | null>;
  /** Unresolved alerts when `unresolvedOnly`, else the latest of every status; newest first. */
  abstract list(unresolvedOnly: boolean): Promise<Alert[]>;
  abstract latestUnresolvedSos(employeeId: string): Promise<Alert | null>;
  abstract acknowledge(id: string, by: string, at: Date): Promise<void>;
  abstract resolve(id: string, by: string | null, at: Date, note?: string): Promise<void>;
  /** Resolves the alert raised for an unanswered welfare check; returns whether there was one. */
  abstract resolveForWelfareCheck(checkId: string, at: Date): Promise<boolean>;
}

export interface WelfareCheck {
  id: string;
  employeeId: string;
  locationId: string;
  promptedAt: Date;
  respondBy: Date;
  respondedAt: Date | null;
  escalatedAt: Date | null;
}

/** All methods require a tenant unit of work. */
export abstract class WelfareCheckRepository {
  abstract findById(id: string): Promise<WelfareCheck | null>;
  /** The employee's latest check still waiting for an answer. */
  abstract pendingFor(employeeId: string): Promise<WelfareCheck | null>;
  abstract respond(
    id: string,
    at: Date,
    position: { latitude: number; longitude: number } | null,
  ): Promise<void>;
}
