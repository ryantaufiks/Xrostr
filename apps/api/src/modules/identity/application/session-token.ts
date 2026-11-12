const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Splits `<uuid>.<secret>` tokens (refresh tokens and invites). */
function parsePrefixedToken(token: string): { prefix: string; secret: string } | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const prefix = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  return UUID.test(prefix) && secret.length > 0 ? { prefix, secret } : null;
}

export function parseSessionToken(token: string): { sessionId: string; secret: string } | null {
  const parsed = parsePrefixedToken(token);
  return parsed && { sessionId: parsed.prefix, secret: parsed.secret };
}

export function parseInviteToken(token: string): { tenantId: string; secret: string } | null {
  const parsed = parsePrefixedToken(token);
  return parsed && { tenantId: parsed.prefix, secret: parsed.secret };
}
