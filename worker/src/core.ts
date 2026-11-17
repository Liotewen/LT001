export const CHAT_MODEL = 'gpt-6.1-sol';
export const SESSION_COOKIE = 'lt_chat_session';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

export type ReasoningEffort = 'low' | 'medium' | 'high';
export type TextPart = { type: 'text'; text: string };
export type ImagePart = { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };
export type ChatMessage = { role: 'user' | 'assistant'; content: string | Array<TextPart | ImagePart> };

const MAX_IMAGE_DATA_URL_LENGTH = 750_000;
const MAX_IMAGE_CONTEXT_LENGTH = 6_000_000;

function parseImagePart(part: Record<string, unknown>): ImagePart {
  if (!isRecord(part.image_url) || typeof part.image_url.url !== 'string') throw new InputError('图片格式无效');
  const url = part.image_url.url;
  if (url.length > MAX_IMAGE_DATA_URL_LENGTH) throw new InputError('图片内容过大，请压缩后重试');
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  if (!match || match[2].length % 4 !== 0) throw new InputError('图片格式无效，请重新上传 JPG、PNG 或 WebP 图片');
  let header: string;
  try { header = atob(match[2].slice(0, 24)); } catch { throw new InputError('图片格式无效'); }
  const valid = match[1] === 'jpeg' ? header.startsWith('\xff\xd8\xff')
    : match[1] === 'png' ? header.startsWith('\x89PNG\r\n\x1a\n')
      : header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
  if (!valid) throw new InputError('图片格式与内容不匹配，请重新上传');
  const detail = part.image_url.detail;
  if (detail !== undefined && detail !== 'auto' && detail !== 'low' && detail !== 'high') throw new InputError('图片清晰度参数无效');
  return { type: 'image_url', image_url: { url, ...(detail ? { detail } : {}) } };
}

export class InputError extends Error {
  readonly code = 'INVALID_INPUT';
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, max: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function parseLoginBody(body: unknown) {
  if (!isRecord(body) || !boundedString(body.username, 120) || !boundedString(body.password, 240)) {
    throw new InputError('请输入账号和密码');
  }
  return { username: body.username as string, password: body.password as string };
}

export function parseChatBody(body: unknown): { messages: ChatMessage[]; reasoningEffort: ReasoningEffort } {
  if (!isRecord(body) || !Array.isArray(body.messages) || body.messages.length < 1) {
    throw new InputError('消息不能为空');
  }
  if (body.messages.length > 100) throw new InputError('当前对话已超过 100 条消息，请新建对话后继续。原对话仍保存在本机。');
  const messages: ChatMessage[] = [];
  let totalLength = 0;
  let imageLength = 0;
  let imageCount = 0;
  for (const item of body.messages) {
    if (!isRecord(item) || (item.role !== 'user' && item.role !== 'assistant')) {
      throw new InputError('消息格式无效');
    }
    let content: ChatMessage['content'];
    if (typeof item.content === 'string') {
      if (!boundedString(item.content, 20_000)) throw new InputError('消息格式无效');
      content = item.content;
      totalLength += content.length;
    } else {
      if (item.role !== 'user' || !Array.isArray(item.content) || !item.content.length || item.content.length > 8) throw new InputError('消息格式无效');
      const parts: Array<TextPart | ImagePart> = [];
      let textLength = 0;
      let imagesInMessage = 0;
      for (const part of item.content) {
        if (!isRecord(part)) throw new InputError('消息格式无效');
        if (part.type === 'text') {
          if (!boundedString(part.text, 20_000)) throw new InputError('消息文字格式无效');
          textLength += (part.text as string).length;
          if (textLength > 20_000) throw new InputError('单条消息文字过长');
          parts.push({ type: 'text', text: part.text as string });
        } else if (part.type === 'image_url') {
          imagesInMessage += 1;
          if (imagesInMessage > 4) throw new InputError('每条消息最多上传 4 张图片');
          const image = parseImagePart(part);
          imageLength += image.image_url.url.length;
          imageCount += 1;
          if (imageLength > MAX_IMAGE_CONTEXT_LENGTH || imageCount > 20) {
            throw new InputError('当前对话图片过多，请新建对话继续。原图片仍保存在本机。');
          }
          parts.push(image);
        } else throw new InputError('不支持的消息内容');
      }
      totalLength += textLength;
      content = parts;
    }
    if (totalLength > 200_000) throw new InputError('消息内容过长');
    messages.push({ role: item.role, content });
  }
  if (body.reasoningEffort !== 'low' && body.reasoningEffort !== 'medium' && body.reasoningEffort !== 'high') {
    throw new InputError('思考深度无效');
  }
  return { messages, reasoningEffort: body.reasoningEffort };
}

export function buildUpstreamChatRequest(messages: ChatMessage[], effort: ReasoningEffort) {
  return { model: CHAT_MODEL, messages, stream: true, reasoning_effort: effort };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64UrlEncode(value: string) {
  return bytesToBase64(new TextEncoder().encode(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(base64ToBytes(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
}

async function sign(encoded: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded));
  return bytesToBase64(new Uint8Array(signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function createSessionToken(username: string, secret: string, now = Date.now()) {
  const payload = { username, exp: Math.floor(now / 1000) + SESSION_SECONDS };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${await sign(encoded, secret)}`;
}

export async function verifySessionToken(token: string, secret: string, now = Date.now()): Promise<{ username: string; exp: number } | null> {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let expected: string;
  let payload: unknown;
  try {
    expected = await sign(parts[0], secret);
    payload = JSON.parse(base64UrlDecode(parts[0]));
  } catch {
    return null;
  }
  if (expected.length !== parts[1].length || [...expected].some((character, index) => character !== parts[1][index])) return null;
  if (!isRecord(payload) || typeof payload.username !== 'string' || !payload.username || typeof payload.exp !== 'number') return null;
  if (payload.exp <= Math.floor(now / 1000)) return null;
  return { username: payload.username, exp: payload.exp };
}

export function normalizeUpstreamError(status: number) {
  if (status === 401 || status === 403) return { code: 'PROVIDER_AUTH', status: 502, message: '模型服务鉴权失败，请检查服务配置' };
  if (status === 429) return { code: 'PROVIDER_RATE_LIMIT', status: 429, message: '模型服务当前繁忙，请稍后重试' };
  if (status === 0 || status >= 500) return { code: 'PROVIDER_UNAVAILABLE', status: 503, message: '模型服务暂时不可用，请稍后重试' };
  return { code: 'PROVIDER_ERROR', status: 502, message: '模型请求失败，请检查输入后重试' };
}
