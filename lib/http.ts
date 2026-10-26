import { authErrorResponse, AuthError, requireSession } from '@/lib/auth';
import { ProviderError } from '@/lib/provider';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function withSession(request: Request, handler: () => Response | Promise<Response>) {
  try {
    requireSession(request);
    return await handler();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    if (error instanceof ApiError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    if (error instanceof ProviderError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return Response.json({ error: { code: 'INTERNAL', message: '请求失败，请稍后重试' } }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'INVALID_INPUT', '请求内容无效');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'INVALID_INPUT', '请求内容无效');
  }
  return body as Record<string, unknown>;
}
