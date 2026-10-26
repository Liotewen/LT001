const baseUrl = (process.env.SITE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const username = process.env.APP_USERNAME;
const password = process.env.APP_PASSWORD;

if (!username || !password) {
  throw new Error('APP_USERNAME 和 APP_PASSWORD 必须已配置');
}

const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password }),
});

if (!loginResponse.ok) {
  throw new Error(`登录检查失败 (${loginResponse.status})`);
}

const cookie = loginResponse.headers.get('set-cookie')?.split(';', 1)[0];
if (!cookie) throw new Error('登录成功响应中没有会话 Cookie');

const projectsResponse = await fetch(`${baseUrl}/api/projects`, {
  headers: { cookie },
});
if (!projectsResponse.ok || !Array.isArray(await projectsResponse.json())) {
  throw new Error(`受保护的项目接口检查失败 (${projectsResponse.status})`);
}

const conversationResponse = await fetch(`${baseUrl}/api/conversations`, {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ reasoningEffort: 'medium' }),
});
if (!conversationResponse.ok) {
  throw new Error(`会话创建检查失败 (${conversationResponse.status})`);
}

const conversation = await conversationResponse.json();
const deleteResponse = await fetch(`${baseUrl}/api/conversations/${encodeURIComponent(conversation.id)}`, {
  method: 'DELETE',
  headers: { cookie },
});
if (!deleteResponse.ok) {
  throw new Error(`临时会话清理失败 (${deleteResponse.status})`);
}

console.log('登录、受保护接口和会话创建/删除检查通过');
