# Pages API 入口

GitHub Pages 仍发布 `site/`。手机通过 `https://lt-ai-chat-proxy.pages.dev/api/*` 访问这里的 Pages Function，由 Cloudflare 服务端转发到现有 `lt-chat-proxy` Worker。模型 Key 和登录配置仍只保存在原 Worker secrets，当前入口不保存密码、对话或模型 Key。

生产部署：

```powershell
node --test cloudflare-pages/proxy-worker.check.mjs
npx wrangler pages deploy cloudflare-pages/deploy --project-name lt-ai-chat-proxy --branch main
```

Wrangler 会把 `deploy/_worker.js` 和它引用的 `proxy.mjs` 打成服务端包；只上传 `deploy/`，不要上传仓库根目录。项目已经创建，不需要重新创建或授权。

只允许来源 `https://liotewen.github.io`。登录和聊天继续由原 Worker 校验，保留跨域预检、Bearer 会话、服务端错误码和 SSE 流。`proxy-worker.check.mjs` 验证请求体及授权头转发、来源拒绝、预检、流式输出和安全的连接错误。

修复背景：手机能打开 GitHub Pages，但请求 `workers.dev` 时出现 `Failed to fetch`。2026-10-27 阿里 DNS 的 HTTPS 查询将原域名解析为 `199.96.62.21`，而新 Pages 域名解析为 Cloudflare 的 `172.66.47.98` / `172.66.44.158`。本机普通 DNS 被代理的 fake-IP 模式接管，因此不能把本机 `198.18.*` 的结果当作国内 DNS 的证据。Pages 免费域名的可达性仍取决于当地网络，需以实际手机重试为准。

回退时将 `site/config.js` 的地址恢复为原 Worker 地址，再发布 GitHub Pages。无需改登录秘密或本地聊天历史的存储格式。
