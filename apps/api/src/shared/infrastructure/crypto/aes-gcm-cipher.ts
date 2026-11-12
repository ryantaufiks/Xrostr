import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { SecretCipher } from '../../application/ports.js';

const VERSION = 'v1';
const IV_BYTES = 12;

/**
 * AES-256-GCM with a random IV per value. Output: `v1.<iv>.<tag>.<ciphertext>` (base64url).
 * The version prefix leaves room for key rotation and per-tenant KMS keys later.
 */
export class AesGcmCipher extends SecretCipher {
  constructor(private readonly key: Buffer) {
    super();
    if (key.length !== 32) throw new Error('AES-256-GCM needs a 32-byte key');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  decrypt(ciphertext: string): string {
    const [version, iv, tag, data] = ciphertext.split('.');
    if (version !== VERSION || !iv || !tag || data === undefined) {
      throw new Error('Unrecognised ciphertext format');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
