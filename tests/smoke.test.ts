import { describe, expect, it } from 'vitest';

describe('workspace scaffold', () => {
  it('exposes the fixed provider defaults', async () => {
    const { CHAT_MODEL, IMAGE_MODEL } = await import('@/lib/constants');
    expect(CHAT_MODEL).toBe('gpt-6.1-sol');
    expect(IMAGE_MODEL).toBe('gpt-image-2.5');
  });
});
