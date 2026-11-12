import type { Permission, SessionStage } from '@xrostr/contracts';
import type { SubjectRef } from './account.js';

/** The authenticated caller of a request, decoded from the access token. */
export interface Principal {
  readonly subject: SubjectRef;
  readonly sessionId: string;
  readonly stage: SessionStage;
  readonly permissions: readonly Permission[];
}

export function hasPermissions(principal: Principal, required: readonly Permission[]): boolean {
  return required.every((p) => principal.permissions.includes(p));
}
