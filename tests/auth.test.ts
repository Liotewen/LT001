import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, verifyCredentials, verifySessionToken } from '@/lib/auth';

afterEach(() => vi.unstubAllEnvs());

describe('session authentication', () => {
  it('accepts only the configured username and password', () => {
    const env = { APP_USERNAME: 'owner', APP_PASSWORD: 'correct horse' };
    expect(verifyCredentials('owner', 'correct horse', env)).toBe(true);
    expect(verifyCredentials('owner', 'wrong', env)).toBe(false);
    expect(verifyCredentials('other', 'correct horse', env)).toBe(false);
  });

  it('rejects changed and expired signed session tokens', () => {
    const now = 1_800_000_000_000;
    const token = createSessionToken('owner', 'test-secret', now);
    expect(verifySessionToken(token, 'test-secret', now)?.username).toBe('owner');
    expect(verifySessionToken(`${token}x`, 'test-secret', now)).toBeNull();
    expect(verifySessionToken(token, 'test-secret', now + 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it('sets an HttpOnly cookie after a valid login', async () => {
    vi.stubEnv('APP_USERNAME', 'owner');
    vi.stubEnv('APP_PASSWORD', 'correct horse');
    vi.stubEnv('APP_SESSION_SECRET', 'test-secret');
    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'correct horse' }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax');
  });
});
