import { deleteProject, getProject, updateProject } from '@/lib/repositories';
import { ApiError, readJson, withSession } from '@/lib/http';
import { isNonEmptyString } from '@/lib/validation';

type Context = { params: Promise<{ id: string }> };

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: Context) {
  return withSession(request, async () => {
    const { id } = await params;
    const body = await readJson(request);
    if (body.name !== undefined && !isNonEmptyString(body.name, 64)) {
      throw new ApiError(400, 'INVALID_INPUT', '项目名称为 1 至 64 个字符');
    }
    if (body.color !== undefined && (typeof body.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(body.color))) {
      throw new ApiError(400, 'INVALID_INPUT', '项目颜色无效');
    }
    if (body.archived !== undefined && typeof body.archived !== 'boolean') throw new ApiError(400, 'INVALID_INPUT', '归档状态无效');
    if (body.name === undefined && body.color === undefined && body.archived === undefined) throw new ApiError(400, 'INVALID_INPUT', '没有可更新的内容');
    const project = updateProject(id, {
      name: body.name as string | undefined,
      color: body.color as string | undefined,
      archived: body.archived as boolean | undefined,
    });
    if (!project) throw new ApiError(404, 'NOT_FOUND', '项目不存在');
    return Response.json(project);
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return withSession(request, async () => {
    const { id } = await params;
    if (!getProject(id)) throw new ApiError(404, 'NOT_FOUND', '项目不存在');
    deleteProject(id);
    return new Response(null, { status: 204 });
  });
}
