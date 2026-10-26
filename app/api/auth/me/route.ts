import { authErrorResponse, requireSession } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = requireSession(request);
    return Response.json({ authenticated: true, username: session.username });
  } catch (error) {
    return authErrorResponse(error);
  }
}
