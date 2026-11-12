import { describe, expect, it } from 'vitest';
import { isSameOriginWrite, readTokenPair } from './bff-rules';

const headers = (init: Record<string, string>) => new Headers(init);

describe('isSameOriginWrite', () => {
  it('requires the CSRF header', () => {
    expect(isSameOriginWrite(headers({ host: 'xrostr.cloud' }))).toBe(false);
    expect(isSameOriginWrite(headers({ host: 'xrostr.cloud', 'x-xrostr-csrf': '1' }))).toBe(true);
  });

  it('rejects a foreign origin even with the header', () => {
    const h = headers({
      host: 'xrostr.cloud',
      origin: 'https://evil.example',
      'x-xrostr-csrf': '1',
    });
    expect(isSameOriginWrite(h)).toBe(false);
  });

  it('accepts the same origin', () => {
    const h = headers({
      host: 'xrostr.cloud',
      origin: 'https://xrostr.cloud',
      'x-xrostr-csrf': '1',
    });
    expect(isSameOriginWrite(h)).toBe(true);
  });
});

describe('readTokenPair', () => {
  it('recognises a token pair and nothing else', () => {
    const pair = { accessToken: 'a', refreshToken: 'r', expiresIn: 900, stage: 'full' };
    expect(readTokenPair(pair)).toEqual(pair);
    expect(readTokenPair({ ...pair, stage: 'other' })).toBeNull();
    expect(readTokenPair({ userId: 'x' })).toBeNull();
    expect(readTokenPair(null)).toBeNull();
  });
});
