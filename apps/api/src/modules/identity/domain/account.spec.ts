import { describe, expect, it } from 'vitest';
import {
  afterFailedAttempt,
  afterSuccessfulAttempt,
  isLocked,
  LOCK_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  resolveStage,
} from './account.js';

const now = new Date('2026-11-12T08:00:00Z');

describe('login attempts', () => {
  it('counts failures until the limit, then locks and resets the counter', () => {
    let state = afterSuccessfulAttempt();
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      state = afterFailedAttempt(state, now);
      expect(state).toEqual({ failedLoginCount: i, lockedUntil: null });
    }
    state = afterFailedAttempt(state, now);
    expect(state.failedLoginCount).toBe(0);
    expect(state.lockedUntil).toEqual(new Date(now.getTime() + LOCK_DURATION_MS));
  });

  it('is locked only until lockedUntil', () => {
    const state = { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + 1000) };
    expect(isLocked(state, now)).toBe(true);
    expect(isLocked(state, new Date(now.getTime() + 1000))).toBe(false);
  });
});

describe('resolveStage', () => {
  it('restricts sessions of accounts that must but have not enrolled in 2FA', () => {
    expect(resolveStage({ mfaRequired: true, mfaEnabled: false })).toBe('mfa_setup');
    expect(resolveStage({ mfaRequired: true, mfaEnabled: true })).toBe('full');
    expect(resolveStage({ mfaRequired: false, mfaEnabled: false })).toBe('full');
  });
});
