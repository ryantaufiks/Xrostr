import { createHash } from 'node:crypto';
import { PERMISSIONS, type Permission } from '@xrostr/contracts';
import { jwtVerify, SignJWT } from 'jose';
import { AccessTokenService, type AccessClaims } from '../application/ports.js';

const AUDIENCE = 'xrostr-api';
const ALGORITHM = 'HS256';

/**
 * Fingerprint of the permission catalogue this server knows. A token minted by a server with a
 * different catalogue (before an update that added permissions) is treated as expired, so the
 * portal refreshes it at once and nobody works with a stale set of permissions after a deploy.
 */
export const PERMISSION_CATALOGUE = createHash('sha256')
  .update(PERMISSIONS.join(','))
  .digest('base64url')
  .slice(0, 12);

interface TokenPayload {
  typ: AccessClaims['subjectType'];
  tid: string | null;
  sid: string;
  stage: AccessClaims['stage'];
  perms: Permission[];
  /** Permission catalogue the token was minted with. */
  pcv: string;
}

export class JoseAccessTokenService extends AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly issuer: string,
    private readonly ttlSeconds: number,
  ) {
    super();
    this.key = new TextEncoder().encode(secret);
  }

  sign(claims: AccessClaims): Promise<string> {
    const payload: TokenPayload = {
      typ: claims.subjectType,
      tid: claims.tenantId,
      sid: claims.sessionId,
      stage: claims.stage,
      perms: [...claims.permissions],
      pcv: PERMISSION_CATALOGUE,
    };
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(claims.subjectId)
      .setIssuer(this.issuer)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.key);
  }

  async verify(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify<TokenPayload>(token, this.key, {
        issuer: this.issuer,
        audience: AUDIENCE,
        algorithms: [ALGORITHM],
      });
      if (!payload.sub || !isValidPayload(payload)) return null;
      return {
        subjectType: payload.typ,
        subjectId: payload.sub,
        tenantId: payload.tid,
        sessionId: payload.sid,
        stage: payload.stage,
        permissions: payload.perms,
      };
    } catch {
      return null;
    }
  }
}

function isValidPayload(p: Partial<TokenPayload>): p is TokenPayload {
  const knownPermission = (v: unknown) => (PERMISSIONS as readonly unknown[]).includes(v);
  return (
    (p.typ === 'platform_admin' ? p.tid === null : p.typ === 'user' && typeof p.tid === 'string') &&
    typeof p.sid === 'string' &&
    (p.stage === 'full' || p.stage === 'mfa_setup') &&
    p.pcv === PERMISSION_CATALOGUE &&
    Array.isArray(p.perms) &&
    p.perms.every(knownPermission)
  );
}
