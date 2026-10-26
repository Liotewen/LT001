import { getImageTask, insertMessage, updateImageTask } from '@/lib/repositories';
import { ApiError, withSession } from '@/lib/http';
import { getImageGeneration } from '@/lib/provider';

type Context = { params: Promise<{ id: string }> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseTask(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { status: 'processing' as const };
  const root = payload as Record<string, unknown>;
  const nested = Array.isArray(root.data) ? root.data[0] : root.data;
  const data = nested && typeof nested === 'object' ? nested as Record<string, unknown> : {};
  const statusText = String(root.status || data.status || '').toLowerCase();
  const candidateUrl = [root.image_url, root.url, data.url, data.image_url]
    .find((value) => typeof value === 'string') as string | undefined;
  let imageUrl: string | undefined;
  if (candidateUrl) {
    try {
      const url = new URL(candidateUrl);
      if (url.protocol === 'https:' || url.protocol === 'http:') imageUrl = candidateUrl;
    } catch { /* Ignore malformed provider output. */ }
  }
  if (imageUrl || ['completed', 'complete', 'succeeded', 'success', 'done'].includes(statusText)) {
    return { status: 'complete' as const, imageUrl };
  }
  if (['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(statusText)) {
    return { status: 'error' as const };
  }
  return { status: 'processing' as const };
}

export async function GET(request: Request, { params }: Context) {
  return withSession(request, async () => {
    const { id } = await params;
    const task = getImageTask(id);
    if (!task) throw new ApiError(404, 'NOT_FOUND', '图片任务不存在');
    if (task.status === 'complete' || task.status === 'error') return Response.json(task);
    if (!task.provider_task_id) throw new ApiError(409, 'TASK_NOT_READY', '图片任务尚未准备好');

    const providerResult = await getImageGeneration(task.provider_task_id, request.signal);
    const parsed = parseTask(providerResult);
    if (parsed.status === 'complete') {
      if (!parsed.imageUrl) {
        const failed = updateImageTask(task.id, { status: 'error', error: '图片服务没有返回图片地址' });
        return Response.json(failed);
      }
      const completed = updateImageTask(task.id, { status: 'complete', image_url: parsed.imageUrl, error: null });
      if (task.conversation_id) {
        insertMessage({ conversationId: task.conversation_id, role: 'assistant', content: `已根据提示生成图片：${task.prompt}`, imageUrl: parsed.imageUrl });
      }
      return Response.json(completed);
    }
    const updated = updateImageTask(task.id, parsed.status === 'error'
      ? { status: 'error', error: '图片生成失败，请重新尝试' }
      : { status: 'processing' });
    return Response.json(updated);
  });
}
