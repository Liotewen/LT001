import { CHAT_MODEL, IMAGE_MODEL, type ImageSize } from '@/lib/constants';
import { normalizeProviderError, type ProviderErrorCode } from '@/lib/provider-errors';
import type { ReasoningEffort } from '@/lib/validation';

export type ProviderChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };
export class ProviderError extends Error {
  constructor(readonly code: ProviderErrorCode, readonly status: number, message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function buildChatRequest(messages: ProviderChatMessage[], effort: ReasoningEffort) {
  return { model: CHAT_MODEL, messages, stream: true, reasoning_effort: effort };
}

export function buildImageRequest(prompt: string, size: ImageSize, count: number) {
  return { model: IMAGE_MODEL, prompt, size, n: count };
}

function endpoint(path: string) {
  const base = (process.env.XJ_API_BASE_URL || 'https://xjjuhe.site/v1').replace(/\/+$/, '');
  return `${base}${path}`;
}

function authorizationHeaders() {
  const key = process.env.XJ_API_KEY;
  if (!key) throw new ProviderError('PROVIDER_CONFIG', 503, '模型服务尚未配置');
  return { authorization: `Bearer ${key}` };
}

async function normalizeResponseError(response: Response): Promise<ProviderError> {
  const normalized = normalizeProviderError(response.status, await response.json().catch(() => null));
  const status = normalized.code === 'PROVIDER_AUTH' ? 502
    : normalized.code === 'PROVIDER_RATE_LIMIT' ? 429
      : normalized.code === 'PROVIDER_UNAVAILABLE' ? 503 : 502;
  return new ProviderError(normalized.code, status, normalized.message);
}

async function postJson(path: string, body: unknown, signal?: AbortSignal) {
  const headers = { ...authorizationHeaders(), 'content-type': 'application/json' };
  try {
    const response = await fetch(endpoint(path), {
      method: 'POST', headers, body: JSON.stringify(body), signal,
    });
    if (!response.ok) throw await normalizeResponseError(response);
    return response;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const normalized = normalizeProviderError(0, null);
    throw new ProviderError(normalized.code, 503, normalized.message);
  }
}

export function postChatCompletion(messages: ProviderChatMessage[], effort: ReasoningEffort, signal?: AbortSignal) {
  return postJson('/codex/chat/completions', buildChatRequest(messages, effort), signal);
}

export function postImageGeneration(prompt: string, size: ImageSize, count: number, signal?: AbortSignal) {
  return postJson('/images/generations', buildImageRequest(prompt, size, count), signal);
}

export async function getImageGeneration(taskId: string, signal?: AbortSignal) {
  const headers = authorizationHeaders();
  try {
    const response = await fetch(endpoint(`/images/generations/${encodeURIComponent(taskId)}`), { headers, signal });
    if (!response.ok) throw await normalizeResponseError(response);
    return response.json() as Promise<unknown>;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const normalized = normalizeProviderError(0, null);
    throw new ProviderError(normalized.code, 503, normalized.message);
  }
}
