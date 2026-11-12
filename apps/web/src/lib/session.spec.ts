import { describe, expect, it } from 'vitest';
import { destinationAfterLogin, safeNext, type Principal } from './session';

const user = (stage: 'full' | 'mfa_setup' = 'full'): Principal => ({
  subject: { type: 'user', id: 'u', tenantId: 't' },
  sessionId: 's',
  stage,
  permissions: [],
  locale: { locale: 'id', preferred: null, default: 'id' },
});

describe('return path after login', () => {
  it('accepts only same-site paths', () => {
    expect(safeNext('/checkin?l=1&c=2')).toBe('/checkin?l=1&c=2');
    expect(safeNext('//evil.example/x')).toBeNull();
    expect(safeNext('/\\evil.example')).toBeNull();
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });

  it('returns a tenant user to a check-in link but not to another area', () => {
    expect(destinationAfterLogin(user(), '/checkin?l=1&c=2')).toBe('/checkin?l=1&c=2');
    expect(destinationAfterLogin(user(), '/platform/tenants')).toBe('/tenant');
    expect(destinationAfterLogin(user('mfa_setup'), '/checkin?l=1')).toBe('/mfa-setup');
  });
});
