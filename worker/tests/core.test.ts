import { describe, expect, it } from 'vitest';
import {
  buildUpstreamChatRequest,
  createSessionToken,
  normalizeUpstreamError,
  parseChatBody,
  parseLoginBody,
  verifySessionToken,
} from '../src/core';

describe('worker core validation and signing', () => {
  it('accepts only bounded login payloads', () => {
    expect(parseLoginBody({ username: 'owner', password: 'secret' })).toEqual({ username: 'owner', password: 'secret' });
    expect(() => parseLoginBody({ username: '', password: 'secret' })).toThrow('请输入账号和密码');
    expect(() => parseLoginBody({ username: 'owner' })).toThrow('请输入账号和密码');
  });

  it('accepts ordered chat context and reasoning effort', () => {
    expect(parseChatBody({
      messages: [
        { role: 'user', content: '记住背景' },
        { role: 'assistant', content: '已记住' },
        { role: 'user', content: '继续' },
      ],
      reasoningEffort: 'high',
    })).toEqual({
      messages: [
        { role: 'user', content: '记住背景' },
        { role: 'assistant', content: '已记住' },
        { role: 'user', content: '继续' },
      ],
      reasoningEffort: 'high',
    });
    expect(() => parseChatBody({ messages: [], reasoningEffort: 'medium' })).toThrow('消息不能为空');
    expect(() => parseChatBody({ messages: [{ role: 'system', content: '越权' }], reasoningEffort: 'medium' })).toThrow('消息格式无效');
  });

  it('signs sessions and rejects tampering or expiry', async () => {
    const now = 1_800_000_000_000;
    const token = await createSessionToken('owner', 'test-secret', now);
    expect((await verifySessionToken(token, 'test-secret', now))?.username).toBe('owner');
    expect(await verifySessionToken(`${token}x`, 'test-secret', now)).toBeNull();
    expect(await verifySessionToken(token, 'test-secret', now + 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it('builds the fixed upstream request without browser-only fields', () => {
    const request = buildUpstreamChatRequest([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ], 'low');
    expect(request).toEqual({
      model: 'gpt-6.1-sol',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
      ],
      stream: true,
      reasoning_effort: 'low',
    });
  });

  it('maps provider statuses to safe client errors', () => {
    expect(normalizeUpstreamError(401)).toEqual({ code: 'PROVIDER_AUTH', status: 502, message: '模型服务鉴权失败，请检查服务配置' });
    expect(normalizeUpstreamError(429)).toEqual({ code: 'PROVIDER_RATE_LIMIT', status: 429, message: '模型服务当前繁忙，请稍后重试' });
    expect(normalizeUpstreamError(503)).toEqual({ code: 'PROVIDER_UNAVAILABLE', status: 503, message: '模型服务暂时不可用，请稍后重试' });
  });
});
