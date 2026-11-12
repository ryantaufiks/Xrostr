import type { TokenPair } from '@xrostr/contracts';

export const ACCESS_COOKIE = 'xr_at';
export const REFRESH_COOKIE = 'xr_rt';
/** Upper bound for the cookie; the API enforces the real refresh-token expiry. */
export const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/** Custom header a cross-site form or image cannot send without a CORS preflight. */
export const CSRF_HEADER = 'x-xrostr-csrf';

/**
 * A state-changing request must carry the CSRF header and, when the browser sends an
 * Origin, come from the same host it was sent to.
 */
export function isSameOriginWrite(headers: Headers): boolean {
  if (headers.get(CSRF_HEADER) !== '1') return false;
  const origin = headers.get('origin');
  if (!origin) return true;
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function readTokenPair(value: unknown): TokenPair | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<TokenPair>;
  return typeof v.accessToken === 'string' &&
    typeof v.refreshToken === 'string' &&
    typeof v.expiresIn === 'number' &&
    (v.stage === 'full' || v.stage === 'mfa_setup')
    ? (v as TokenPair)
    : null;
}
