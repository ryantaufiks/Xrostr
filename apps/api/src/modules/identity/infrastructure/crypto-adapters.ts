import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import * as OTPAuth from 'otpauth';
import { OpaqueTokens, PasswordHasher, TotpService } from '../application/ports.js';

/** OWASP-recommended Argon2id baseline (Argon2id is the library default): 19 MiB, 2 passes, 1 lane. */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export class Argon2PasswordHasher extends PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string | null, password: string): Promise<boolean> {
    if (!passwordHash) {
      this.dummyHash ??= hash(randomBytes(16).toString('hex'), ARGON2_OPTIONS);
      await verify(await this.dummyHash, password);
      return false;
    }
    return verify(passwordHash, password);
  }
}

const TOTP_ISSUER = 'InRoster HRMS';

export class OtpauthTotpService extends TotpService {
  generateSecret(): string {
    return new OTPAuth.Secret({ size: 20 }).base32;
  }

  buildUri(secret: string, accountLabel: string): string {
    return this.totp(secret, accountLabel).toString();
  }

  verify(secret: string, code: string): boolean {
    // window 1 accepts the previous and next 30-second step to absorb clock drift.
    return this.totp(secret).validate({ token: code, window: 1 }) !== null;
  }

  private totp(secret: string, label = 'account'): OTPAuth.TOTP {
    return new OTPAuth.TOTP({
      issuer: TOTP_ISSUER,
      label,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
  }
}

export class CryptoOpaqueTokens extends OpaqueTokens {
  generate(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  matches(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(token), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
