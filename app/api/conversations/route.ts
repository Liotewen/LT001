import { createConversation, getProject, listConversations } from '@/lib/repositories';
import { ApiError, readJson, withSession } from '@/lib/http';
import { isNonEmptyString, isReasoningEffort } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return withSession(request, () => {
    const query = new URL(request.url).searchParams;
    const projectId = query.get('projectId');
    const archived = query.get('archived') === 'true';
    if (projectId === null) return Response.json(listConversations(undefined, undefined, archived));
    if (projectId === 'none') return Response.json(listConversations(null, undefined, archived));
    return Response.json(listConversations(projectId, undefined, archived));
  });
}

export async function POST(request: Request) {
  return withSession(request, async () => {
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
    const conversation = createConversation({
      projectId: body.projectId as string | null | undefined,
      title: body.title as string | undefined,
      reasoningEffort: body.reasoningEffort as 'low' | 'medium' | 'high' | undefined,
    });
    return Response.json(conversation, { status: 201 });
  });
}
