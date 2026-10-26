import { createSessionToken, sessionCookie, verifyCredentials } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: 'INVALID_INPUT', message: '请输入账号和密码' } }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return Response.json({ error: { code: 'INVALID_INPUT', message: '请输入账号和密码' } }, { status: 400 });
  }
  const { username, password } = body as Record<string, unknown>;
  if (typeof username !== 'string' || typeof password !== 'string') {
    return Response.json({ error: { code: 'INVALID_INPUT', message: '请输入账号和密码' } }, { status: 400 });
  }
  if (!process.env.APP_SESSION_SECRET) {
    return Response.json({ error: { code: 'SERVER_CONFIG', message: '登录服务尚未配置' } }, { status: 503 });
  }
  if (!verifyCredentials(username, password)) {
    return Response.json({ error: { code: 'INVALID_CREDENTIALS', message: '账号或密码错误' } }, { status: 401 });
  }
  const token = createSessionToken(username, process.env.APP_SESSION_SECRET);
  return Response.json({ authenticated: true, username }, { headers: { 'set-cookie': sessionCookie(token) } });
}
