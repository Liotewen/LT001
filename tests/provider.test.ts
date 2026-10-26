import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildChatRequest, buildImageRequest, postChatCompletion } from '@/lib/provider';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('provider request construction', () => {
  it('sends the entire ordered conversation to the fixed chat model', () => {
    const messages = [
      { role: 'user' as const, content: '请记住这个项目背景' },
      { role: 'assistant' as const, content: '已记录背景' },
      { role: 'user' as const, content: '基于背景继续' },
    ];
    expect(buildChatRequest(messages, 'high')).toEqual({
      model: 'gpt-6.1-sol', messages, stream: true, reasoning_effort: 'high',
    });
  });

  it('uses the fixed image model and requested size/count', () => {
    expect(buildImageRequest('一只橘猫', '1024x1024', 2)).toEqual({
      model: 'gpt-image-2.5', prompt: '一只橘猫', size: '1024x1024', n: 2,
    });
  });

  it('keeps provider authorization on the server request', async () => {
    vi.stubEnv('XJ_API_KEY', 'test-only-key');
    vi.stubEnv('XJ_API_BASE_URL', 'https://xjjuhe.site/v1');
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    await postChatCompletion([{ role: 'user', content: 'hello' }], 'medium');
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];

    expect(url).toBe('https://xjjuhe.site/v1/codex/chat/completions');
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer test-only-key');
    expect(String(options.body)).not.toContain('test-only-key');
  });
});
