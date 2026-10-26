import { createProject, listProjects } from '@/lib/repositories';
import { ApiError, readJson, withSession } from '@/lib/http';
import { isNonEmptyString } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return withSession(request, () => {
    const archived = new URL(request.url).searchParams.get('archived') === 'true';
    return Response.json(listProjects(undefined, archived));
  });
}

export async function POST(request: Request) {
  return withSession(request, async () => {
    const body = await readJson(request);
    if (!isNonEmptyString(body.name, 64)) throw new ApiError(400, 'INVALID_INPUT', '项目名称为 1 至 64 个字符');
    if (body.color !== undefined && (typeof body.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(body.color))) {
      throw new ApiError(400, 'INVALID_INPUT', '项目颜色无效');
    }
    return Response.json(createProject({ name: body.name, color: body.color as string | undefined }), { status: 201 });
  });
}
