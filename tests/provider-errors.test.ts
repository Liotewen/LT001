import { describe, expect, it } from 'vitest';
import { normalizeProviderError } from '@/lib/provider-errors';

describe('provider error normalization', () => {
  it('maps authentication, rate limit, and upstream failures to safe messages', () => {
    expect(normalizeProviderError(401, {}).code).toBe('PROVIDER_AUTH');
    expect(normalizeProviderError(429, {}).code).toBe('PROVIDER_RATE_LIMIT');
    expect(normalizeProviderError(503, { message: 'private upstream detail' })).toEqual({
      code: 'PROVIDER_UNAVAILABLE', message: '模型服务暂时不可用，请稍后重试',
    });
  });

  it('does not expose an upstream credential in error messages', () => {
    const result = normalizeProviderError(400, { error: { message: 'invalid key sk-secret' } });
    expect(result.code).toBe('PROVIDER_ERROR');
    expect(result.message).not.toContain('sk-secret');
  });
});
