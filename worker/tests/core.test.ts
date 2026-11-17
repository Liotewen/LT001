import { describe, expect, it } from 'vitest';
import {
  buildUpstreamChatRequest,
  createSessionToken,
  normalizeUpstreamError,
  parseChatBody,
  parseLoginBody,
  verifySessionToken,
} from '../src/core';

const pngUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S8AAAAASUVORK5CYII=';
const imagePart = (url = pngUrl) => ({ type: 'image_url', image_url: { url, detail: 'auto' } });

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

  it('accepts image context without losing message order and strips extra fields', () => {
    const parsed = parseChatBody({ messages: [
      { role: 'user', content: [
        { type: 'text', text: '看一下截图', ignored: 'discard' },
        { ...imagePart(), ignored: 'discard' },
      ], ignored: 'discard' },
      { role: 'assistant', content: '收到图片' },
      { role: 'user', content: '继续分析' },
    ], reasoningEffort: 'high' });
    expect(parsed.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: '看一下截图' }, imagePart()] },
      { role: 'assistant', content: '收到图片' },
      { role: 'user', content: '继续分析' },
    ]);
  });

  it('rejects unsafe image sources, malformed base64 and spoofed image types', () => {
    for (const url of ['https://example.com/a.png', 'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/png;base64,SGVsbG8=', 'data:image/jpeg;base64,iVBORw0KGgo=',
      'data:image/png;base64,iVBORw0KGgo=!!!!', 'data:image/png;base64,iVBORw0KGgo']) {
      expect(() => parseChatBody({ messages: [{ role: 'user', content: [imagePart(url)] }], reasoningEffort: 'low' })).toThrow();
    }
  });

  it('limits image count and image size before contacting the provider', () => {
    expect(() => parseChatBody({ messages: [{ role: 'user', content: Array.from({ length: 5 }, () => imagePart()) }], reasoningEffort: 'low' })).toThrow(/4.*图片/);
    const largePng = `data:image/png;base64,${btoa('\x89PNG\r\n\x1a\n' + 'A'.repeat(570_000))}`;
    expect(() => parseChatBody({ messages: [{ role: 'user', content: [imagePart(largePng)] }], reasoningEffort: 'low' })).toThrow(/图片.*过大/);
    const mediumPng = `data:image/png;base64,${btoa('\x89PNG\r\n\x1a\n' + 'A'.repeat(400_000))}`;
    const messages = Array.from({ length: 3 }, () => ({ role: 'user', content: Array.from({ length: 4 }, () => imagePart(mediumPng)) }));
    expect(() => parseChatBody({ messages, reasoningEffort: 'low' })).toThrow(/图片.*新建对话/);
  });

  it('validates multimodal text and rejects unsupported content parts', () => {
    for (const content of [[], [{ type: 'text', text: '' }], [{ type: 'input_audio', input_audio: {} }],
      [imagePart(), { type: 'text', text: 'a'.repeat(20_001) }],
      [{ type: 'text', text: 'a'.repeat(11_000) }, { type: 'text', text: 'b'.repeat(11_000) }]]) {
      expect(() => parseChatBody({ messages: [{ role: 'user', content }], reasoningEffort: 'medium' })).toThrow();
    }
    expect(() => parseChatBody({ messages: [{ role: 'assistant', content: [imagePart()] }], reasoningEffort: 'low' })).toThrow();
    expect(() => parseChatBody({ messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: pngUrl, detail: 'invalid' } }] }], reasoningEffort: 'low' })).toThrow();
  });

  it('explains the context limit without silently dropping messages', () => {
    const messages = Array.from({ length: 101 }, () => ({ role: 'user', content: '保留我的上下文' }));
    expect(() => parseChatBody({ messages, reasoningEffort: 'medium' })).toThrow(/100.*新建对话/);
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
