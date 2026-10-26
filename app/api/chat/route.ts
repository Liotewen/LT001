import { getConversation, insertMessage, listMessages, updateConversation } from '@/lib/repositories';
import { ApiError, readJson, withSession } from '@/lib/http';
import { postChatCompletion, ProviderError, type ProviderChatMessage } from '@/lib/provider';
import { isNonEmptyString, isReasoningEffort } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function event(controller: ReadableStreamDefaultController<Uint8Array>, name: string, payload: unknown) {
  controller.enqueue(new TextEncoder().encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`));
}

function deltaText(value: unknown) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((part) => {
    if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') return part.text;
    return '';
  }).join('');
}

function createClientStream(body: ReadableStream<Uint8Array>, conversationId: string) {
  const reader = body.getReader();
  const encoder = new TextDecoder();
  let accumulated = '';
  let lineBuffer = '';
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const processLine = (line: string) => {
        if (!line.startsWith('data:')) return;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') return;
        let payload: unknown;
        try { payload = JSON.parse(raw); } catch { return; }
        if (!payload || typeof payload !== 'object') return;
        const record = payload as Record<string, unknown>;
        if (record.error) throw new ProviderError('PROVIDER_ERROR', 502, '模型请求失败，请稍后重试');
        const choices = record.choices;
        if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return;
        const delta = (choices[0] as Record<string, unknown>).delta;
        if (!delta || typeof delta !== 'object') return;
        const content = deltaText((delta as Record<string, unknown>).content);
        if (!content) return;
        accumulated += content;
        event(controller, 'delta', { content });
      };

      try {
        while (!cancelled) {
          const result = await reader.read();
          if (result.done) break;
          lineBuffer += encoder.decode(result.value, { stream: true });
          let newline = lineBuffer.indexOf('\n');
          while (newline >= 0) {
            processLine(lineBuffer.slice(0, newline).replace(/\r$/, ''));
            lineBuffer = lineBuffer.slice(newline + 1);
            newline = lineBuffer.indexOf('\n');
          }
        }
        lineBuffer += encoder.decode();
        if (lineBuffer) processLine(lineBuffer.replace(/\r$/, ''));
        if (accumulated) {
          const assistant = insertMessage({ conversationId, role: 'assistant', content: accumulated });
          event(controller, 'done', { messageId: assistant.id });
        } else {
          event(controller, 'done', { messageId: null });
        }
        controller.close();
      } catch (error) {
        if (accumulated) insertMessage({ conversationId, role: 'assistant', content: accumulated, status: 'error' });
        const providerError = error instanceof ProviderError ? error : new ProviderError('PROVIDER_UNAVAILABLE', 503, '模型服务暂时不可用，请稍后重试');
        event(controller, 'error', { code: providerError.code, message: providerError.message });
        controller.close();
      }
    },
    async cancel() {
      cancelled = true;
      await reader.cancel().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

export async function POST(request: Request) {
  return withSession(request, async () => {
    const body = await readJson(request);
    if (!isNonEmptyString(body.conversationId, 80) || !isNonEmptyString(body.content, 20_000)) {
      throw new ApiError(400, 'INVALID_INPUT', '会话和消息内容不能为空');
    }
    if (body.reasoningEffort !== undefined && !isReasoningEffort(body.reasoningEffort)) {
      throw new ApiError(400, 'INVALID_INPUT', '思考深度无效');
    }
    const conversation = getConversation(body.conversationId);
    if (!conversation) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    const effort = body.reasoningEffort || conversation.reasoning_effort;
    if (effort !== conversation.reasoning_effort) updateConversation(conversation.id, { reasoningEffort: effort });
    insertMessage({ conversationId: conversation.id, role: 'user', content: body.content as string });
    if (conversation.title === '新对话') updateConversation(conversation.id, { title: body.content as string });

    const history: ProviderChatMessage[] = listMessages(conversation.id)
      .filter((message) => message.status !== 'error')
      .map((message) => ({
        role: message.role,
        content: message.image_url ? `${message.content}\n[图片结果: ${message.image_url}]` : message.content,
      }));
    const upstream = await postChatCompletion(history, effort, request.signal);
    if (!upstream.body) throw new ProviderError('PROVIDER_UNAVAILABLE', 503, '模型服务没有返回内容，请稍后重试');
    return createClientStream(upstream.body, conversation.id);
  });
}
