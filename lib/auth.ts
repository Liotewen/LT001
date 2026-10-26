import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SESSION_COOKIE } from '@/lib/constants';

const SESSION_SECONDS = 7 * 24 * 60 * 60;
const SESSION_MAX_AGE = SESSION_SECONDS;

export interface SessionPayload {
  username: string;
  exp: number;
}

export class AuthError extends Error {
  readonly status = 401;
  readonly code = 'AUTH_REQUIRED';

  constructor() {
    super('请先登录');
    this.name = 'AuthError';
  }
}

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

function safeStringEqual(actual: string, expected: string) {
  return timingSafeEqual(digest(actual), digest(expected));
}

export function verifyCredentials(
  username: string,
  password: string,
  env: { APP_USERNAME?: string; APP_PASSWORD?: string } = process.env as { APP_USERNAME?: string; APP_PASSWORD?: string },
) {
  const expectedUsername = env.APP_USERNAME || '';
  const expectedPassword = env.APP_PASSWORD || '';
  const usernameMatches = safeStringEqual(username, expectedUsername);
  const passwordMatches = safeStringEqual(password, expectedPassword);
  return Boolean(expectedUsername && expectedPassword && usernameMatches && passwordMatches);
}

export function createSessionToken(username: string, secret: string, now = Date.now()) {
  const payload: SessionPayload = { username, exp: Math.floor(now / 1000) + SESSION_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string, secret: string, now = Date.now()): SessionPayload | null {
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra !== undefined) return null;
  const expected = createHmac('sha256', secret).update(encoded).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<SessionPayload>;
    if (typeof payload.username !== 'string' || !payload.username || typeof payload.exp !== 'number') return null;
    if (payload.exp <= Math.floor(now / 1000)) return null;
    return { username: payload.username, exp: payload.exp };
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

export function getRequestSession(request: Request) {
  const secret = process.env.APP_SESSION_SECRET;
  const token = readCookie(request, SESSION_COOKIE);
  if (!secret || !token) return null;
  return verifySessionToken(token, secret);
}

export function requireSession(request: Request) {
  const session = getRequestSession(request);
  if (!session) throw new AuthError();
  return session;
}

export function sessionCookie(token: string, secure = process.env.NODE_ENV === 'production') {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure = process.env.NODE_ENV === 'production') {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  throw error;
}
