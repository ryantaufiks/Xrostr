import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { JoseAccessTokenService } from './jose-access-token.service.js';

const SECRET = 'test-secret-that-is-long-enough-for-hs256';
const service = new JoseAccessTokenService(SECRET, 'xrostr', 900);
const claims = {
  subjectType: 'user' as const,
  subjectId: 'u1',
  tenantId: 't1',
  sessionId: 's1',
  stage: 'full' as const,
  permissions: ['patrols.read' as const],
};

describe('JoseAccessTokenService', () => {
  it('round-trips the claims of a token it minted', async () => {
    expect(await service.verify(await service.sign(claims))).toEqual(claims);
  });

  it('treats a token from another permission catalogue as expired', async () => {
    // What a server from before an update that added permissions would have signed.
    const old = await new SignJWT({ typ: 'user', tid: 't1', sid: 's1', stage: 'full', perms: [] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuer('xrostr')
      .setAudience('xrostr-api')
      .setIssuedAt()
      .setExpirationTime('900s')
      .sign(new TextEncoder().encode(SECRET));
    expect(await service.verify(old)).toBeNull();
  });
});
