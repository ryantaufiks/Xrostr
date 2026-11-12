import type { Permission, SessionStage } from '@xrostr/contracts';

export type SubjectType = 'platform_admin' | 'user';
export type AccountStatus = 'invited' | 'active' | 'disabled';

/** Identifies who a session belongs to. `tenantId` is null for platform admins. */
export interface SubjectRef {
  readonly type: SubjectType;
  readonly id: string;
  readonly tenantId: string | null;
}

export interface LoginAttemptState {
  readonly failedLoginCount: number;
  readonly lockedUntil: Date | null;
}

/** A platform admin or tenant user, as seen by authentication. */
export interface Account extends LoginAttemptState {
  readonly ref: SubjectRef;
  readonly email: string;
  readonly passwordHash: string | null;
  readonly status: AccountStatus;
  readonly mfaSecretEnc: string | null;
  readonly mfaEnabled: boolean;
  readonly mfaRequired: boolean;
  readonly permissions: readonly Permission[];
}

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60_000;

export function isLocked(state: LoginAttemptState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil > now;
}

/** Five consecutive failures lock the account for 15 minutes, then the counter restarts. */
export function afterFailedAttempt(state: LoginAttemptState, now: Date): LoginAttemptState {
  const failedLoginCount = state.failedLoginCount + 1;
  if (failedLoginCount >= MAX_FAILED_ATTEMPTS) {
    return { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) };
  }
  return { failedLoginCount, lockedUntil: null };
}

export const afterSuccessfulAttempt = (): LoginAttemptState => ({
  failedLoginCount: 0,
  lockedUntil: null,
});

/** Accounts whose role demands 2FA get a restricted session until they enrol. */
export function resolveStage(account: Pick<Account, 'mfaEnabled' | 'mfaRequired'>): SessionStage {
  return account.mfaRequired && !account.mfaEnabled ? 'mfa_setup' : 'full';
}
