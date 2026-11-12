import { PERMISSIONS, type Permission } from '@inroster/contracts';
import { jwtVerify, SignJWT } from 'jose';
import { AccessTokenService, type AccessClaims } from '../application/ports.js';

const AUDIENCE = 'inroster-api';
const ALGORITHM = 'HS256';

interface TokenPayload {
  typ: AccessClaims['subjectType'];
  tid: string | null;
  sid: string;
  stage: AccessClaims['stage'];
  perms: Permission[];
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
    Array.isArray(p.perms) &&
    p.perms.every(knownPermission)
  );
}
