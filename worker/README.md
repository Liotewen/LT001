# LT Chat Worker

这是 GitHub Pages 静态站点使用的 Cloudflare Worker 代理。Worker 负责登录、签名会话和模型请求，浏览器永远不会接触 `XJ_API_KEY`。

GitHub Pages 与 workers.dev 属于不同站点，页面使用 `Authorization: Bearer` 携带签名会话，避免手机浏览器屏蔽第三方 Cookie 后无法登录。会话仅保存在当前标签页的 `sessionStorage`（受限时保存在内存），有效期 7 天，退出后清除；对话备份不包含会话令牌。Worker 同时兼容 HttpOnly Cookie。退出不撤销已签发的令牌，如需使所有会话失效，可轮换服务端 `APP_SESSION_SECRET`。

## 部署

在 Cloudflare 控制台创建一个 Workers 项目，或在本目录使用 Wrangler：

```powershell
npm install -g wrangler --registry=https://registry.npmmirror.com
wrangler login
wrangler secret put XJ_API_KEY
wrangler secret put APP_USERNAME
wrangler secret put APP_PASSWORD
wrangler secret put APP_SESSION_SECRET
wrangler deploy
```

把 `worker/wrangler.toml` 的 `WEB_ORIGIN` 改成 GitHub Pages 的来源（只含协议和域名，不含仓库路径），例如项目站点 `https://用户名.github.io/LT001` 对应的来源是 `https://用户名.github.io`。`XJ_API_BASE_URL` 默认使用 `https://xjjuhe.site/v1`，如需修改可在 Cloudflare 变量中覆盖。

建议使用长度足够的随机 `APP_SESSION_SECRET`。账号和密码只通过 Wrangler secret 或 Cloudflare 控制台注入，不写进仓库。

部署完成后，把生成的 `https://*.workers.dev` 地址填入 `site/config.js` 的 `workerUrl`，再发布 Pages。

## 本地检查

Worker 的纯函数和路由测试在仓库根目录运行：

```powershell
npm test -- --run worker/tests/core.test.ts worker/tests/index.test.ts
```

测试使用假的环境变量，不会读取或输出本机 `.env.local`。

每次请求保留当前对话的完整顺序上下文，不自动截断。单次上限为 100 条消息、单条 20,000 字符、总计 200,000 字符；超限会明确提示。模型固定为 `gpt-6.1-sol`，思考深度为 `low / medium / high`。
