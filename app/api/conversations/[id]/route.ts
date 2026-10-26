import { deleteConversation, getConversation, getProject, listImageTasks, listMessages, updateConversation } from '@/lib/repositories';
import { ApiError, readJson, withSession } from '@/lib/http';
import { isNonEmptyString, isReasoningEffort } from '@/lib/validation';

type Context = { params: Promise<{ id: string }> };

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: Context) {
  return withSession(request, async () => {
    const { id } = await params;
    const conversation = getConversation(id);
    if (!conversation) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    return Response.json({ ...conversation, messages: listMessages(id), imageTasks: listImageTasks(id) });
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return withSession(request, async () => {
    const { id } = await params;
    const body = await readJson(request);
    if (body.title !== undefined && !isNonEmptyString(body.title, 120)) {
      throw new ApiError(400, 'INVALID_INPUT', '会话标题不能超过 120 个字符');
    }
    if (body.projectId !== undefined && body.projectId !== null && typeof body.projectId !== 'string') {
      throw new ApiError(400, 'INVALID_INPUT', '项目参数无效');
    }
    if (typeof body.projectId === 'string' && !getProject(body.projectId)) throw new ApiError(404, 'NOT_FOUND', '项目不存在');
    if (body.reasoningEffort !== undefined && !isReasoningEffort(body.reasoningEffort)) {
      throw new ApiError(400, 'INVALID_INPUT', '思考深度无效');
    }
    if (body.archived !== undefined && typeof body.archived !== 'boolean') throw new ApiError(400, 'INVALID_INPUT', '归档状态无效');
    if (body.title === undefined && body.projectId === undefined && body.reasoningEffort === undefined && body.archived === undefined) {
      throw new ApiError(400, 'INVALID_INPUT', '没有可更新的内容');
    }
    const conversation = updateConversation(id, {
      title: body.title as string | undefined,
      projectId: body.projectId as string | null | undefined,
      reasoningEffort: body.reasoningEffort as 'low' | 'medium' | 'high' | undefined,
      archived: body.archived as boolean | undefined,
    });
    if (!conversation) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    return Response.json(conversation);
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return withSession(request, async () => {
    const { id } = await params;
    if (!getConversation(id)) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    deleteConversation(id);
    return new Response(null, { status: 204 });
  });
}
