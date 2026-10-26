import { createImageTask, getConversation, insertMessage, updateImageTask } from '@/lib/repositories';
import { IMAGE_SIZES, type ImageSize } from '@/lib/constants';
import { ApiError, readJson, withSession } from '@/lib/http';
import { postImageGeneration, ProviderError } from '@/lib/provider';
import { isNonEmptyString } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ImagePayload = Record<string, unknown>;

function resultRecord(payload: unknown): ImagePayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return payload as ImagePayload;
}

function nestedRecord(value: unknown): ImagePayload {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ImagePayload : {};
}

function taskResult(payload: unknown) {
  const root = resultRecord(payload);
  const data = Array.isArray(root.data) ? nestedRecord(root.data[0]) : nestedRecord(root.data);
  const task = nestedRecord(root.task);
  const images = Array.isArray(root.images) ? nestedRecord(root.images[0]) : {};
  const providerTaskId = [root.task_id, root.id, data.task_id, task.id].find((value) => typeof value === 'string') as string | undefined;
  const imageUrl = [root.image_url, root.url, data.url, data.image_url, images.url].find((value) => typeof value === 'string') as string | undefined;
  const rawStatus = [root.status, task.status, data.status].find((value) => typeof value === 'string') as string | undefined;
  const normalizedStatus = (rawStatus || '').toLowerCase();
  const status = imageUrl || ['completed', 'complete', 'succeeded', 'success', 'done'].includes(normalizedStatus)
    ? 'complete'
    : ['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(normalizedStatus)
      ? 'error'
      : 'processing';
  return { providerTaskId, imageUrl, status: status as 'complete' | 'error' | 'processing' };
}

function taskResults(payload: unknown) {
  const root = resultRecord(payload);
  const entries = [root.tasks, root.data].find(Array.isArray) as unknown[] | undefined;
  if (!entries?.length) return [taskResult(payload)];
  return entries.map((entry) => {
    const task = nestedRecord(entry);
    return taskResult({ ...root, ...task, task, data: task });
  });
}

function recordImageMessage(task: { conversation_id: string | null; prompt: string }, imageUrl: string) {
  if (task.conversation_id) {
    insertMessage({ conversationId: task.conversation_id, role: 'assistant', content: `已根据提示生成图片：${task.prompt}`, imageUrl });
  }
}

function validImageUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  return withSession(request, async () => {
    const body = await readJson(request);
    if (!isNonEmptyString(body.prompt, 4000)) throw new ApiError(400, 'INVALID_INPUT', '图片描述为 1 至 4000 个字符');
    if (body.conversationId !== undefined && body.conversationId !== null && typeof body.conversationId !== 'string') {
      throw new ApiError(400, 'INVALID_INPUT', '会话参数无效');
    }
    if (typeof body.conversationId === 'string' && !getConversation(body.conversationId)) {
      throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    }
    const size = body.size || '1024x1024';
    if (typeof size !== 'string' || !IMAGE_SIZES.includes(size as ImageSize)) {
      throw new ApiError(400, 'INVALID_INPUT', '图片尺寸无效');
    }
    const count = body.count === undefined ? 1 : body.count;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 4) {
      throw new ApiError(400, 'INVALID_INPUT', '图片数量必须为 1 至 4 张');
    }

    const task = createImageTask({ conversationId: body.conversationId as string | null | undefined, prompt: body.prompt });
    try {
      const upstream = await postImageGeneration(body.prompt, size as ImageSize, count, request.signal);
      const parsed = taskResults(await upstream.json().catch(() => null));
      const tasks = parsed.map((result, index) => {
        const currentTask = index === 0 ? task : createImageTask({ conversationId: task.conversation_id, prompt: task.prompt });
        const imageUrl = validImageUrl(result.imageUrl);
        if (result.status === 'complete' && imageUrl) {
          const completed = updateImageTask(currentTask.id, {
            provider_task_id: result.providerTaskId || null, status: 'complete', image_url: imageUrl,
          });
          recordImageMessage(currentTask, imageUrl);
          return completed;
        }
        if (result.status === 'error' || !result.providerTaskId) {
          return updateImageTask(currentTask.id, {
            provider_task_id: result.providerTaskId || null, status: 'error', error: '图片任务创建失败',
          });
        }
        return updateImageTask(currentTask.id, { provider_task_id: result.providerTaskId, status: 'processing' });
      });
      if (tasks.every((item) => item?.status === 'error')) {
        throw new ProviderError('PROVIDER_ERROR', 502, '图片任务创建失败，请稍后重试');
      }
      const responseStatus = tasks.every((item) => item?.status === 'complete') ? 201 : 202;
      return Response.json(tasks.length === 1 ? tasks[0] : tasks, { status: responseStatus });
    } catch (error) {
      if (error instanceof ProviderError) updateImageTask(task.id, { status: 'error', error: error.message });
      throw error;
    }
  });
}
