import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AesGcmCipher } from './aes-gcm-cipher.js';

describe('AesGcmCipher', () => {
  const cipher = new AesGcmCipher(randomBytes(32));

  it('round-trips and uses a fresh IV for every value', () => {
    const a = cipher.encrypt('JBSWY3DPEHPK3PXP');
    const b = cipher.encrypt('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('detects tampering', () => {
    const parts = cipher.encrypt('secret').split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });

  it('cannot be decrypted with another key', () => {
    const other = new AesGcmCipher(randomBytes(32));
    expect(() => other.decrypt(cipher.encrypt('secret'))).toThrow();
  });
});
