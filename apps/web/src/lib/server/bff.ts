import type { TokenPair } from '@xrostr/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE_SECONDS,
  isSameOriginWrite,
  readTokenPair,
} from './bff-rules';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:8016';
const SAFE_METHODS = new Set(['GET', 'HEAD']);
/** Endpoints where a 401 means wrong credentials, not an expired access token. */
const CREDENTIAL_PATHS = new Set(['auth/login', 'platform/auth/login', 'auth/accept-invite']);

/**
 * Backend-for-frontend: the browser calls /api/* on its own origin and never sees a token.
 * Tokens live in httpOnly, SameSite=Strict cookies; this proxy attaches the access token,
 * refreshes it once when it has expired, and turns token responses into cookies.
 */
export async function proxyToApi(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const path = segments.map(encodeURIComponent).join('/');
  const method = request.method.toUpperCase();
  if (!SAFE_METHODS.has(method) && !isSameOriginWrite(request.headers)) {
    return problem(403, 'csrf_rejected', 'Request rejected.');
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (path === 'auth/refresh') {
    if (!refreshToken)
      return withCookiesCleared(problem(401, 'unauthenticated', 'Sign in to continue.'));
    const refreshed = await callApi(
      request,
      'POST',
      'auth/refresh',
      JSON.stringify({ refreshToken }),
    );
    return toClient(refreshed, path);
  }

  const body = SAFE_METHODS.has(method) ? undefined : await request.text();
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  let upstream = await callApi(request, method, path, body, accessToken);

  let rotated: TokenPair | null = null;
  if (upstream.status === 401 && refreshToken && !CREDENTIAL_PATHS.has(path)) {
    const refreshed = await callApi(
      request,
      'POST',
      'auth/refresh',
      JSON.stringify({ refreshToken }),
    );
    if (refreshed.ok) {
      rotated = readTokenPair(await refreshed.json());
      if (rotated) upstream = await callApi(request, method, path, body, rotated.accessToken);
    }
  }
  return toClient(upstream, path, rotated);
}

function callApi(
  request: NextRequest,
  method: string,
  path: string,
  body?: string,
  accessToken?: string,
): Promise<Response> {
  const headers = new Headers({ accept: 'application/json' });
  if (body) headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  for (const name of ['user-agent', 'x-forwarded-for']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return fetch(`${API_URL}/${path}${request.nextUrl.search}`, {
    method,
    headers,
    body: body || undefined,
    cache: 'no-store',
    redirect: 'manual',
  });
}

async function toClient(
  upstream: Response,
  path: string,
  rotated: TokenPair | null = null,
): Promise<NextResponse> {
  const text = upstream.status === 204 ? '' : await upstream.text();
  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  const tokens = upstream.ok ? readTokenPair(safeJson(text)) : null;

  // Token responses are reduced to what the page needs; the tokens become cookies.
  const response = tokens
    ? NextResponse.json(
        { stage: tokens.stage, expiresIn: tokens.expiresIn },
        { status: upstream.status },
      )
    : new NextResponse(text || null, {
        status: upstream.status,
        headers: text ? { 'content-type': contentType } : undefined,
      });

  const issued = tokens ?? rotated;
  if (issued) setSessionCookies(response, issued);
  if (
    path === 'auth/logout' ||
    (upstream.status === 401 && !issued && !CREDENTIAL_PATHS.has(path))
  ) {
    withCookiesCleared(response);
  }
  response.headers.set('cache-control', 'no-store');
  return response;
}

function setSessionCookies(response: NextResponse, tokens: TokenPair): void {
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: tokens.expiresIn,
  });
  // Only the proxy ever needs the refresh token.
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api',
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
}

function withCookiesCleared(response: NextResponse): NextResponse {
  response.cookies.set(ACCESS_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, '', { path: '/api', maxAge: 0 });
  return response;
}

function problem(status: number, code: string, title: string): NextResponse {
  return NextResponse.json(
    { type: `urn:xrostr:error:${code}`, title, status, code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
