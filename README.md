# LT AI Workspace

一个手机优先的私有 AI 工作区，支持项目、完整对话历史、可选思考深度和图片生成。聊天固定使用 `gpt-6.1-sol`，图片固定使用 `gpt-image-2.5`。模型 API Key 只在服务端读取。

## 本机启动

环境要求：Node.js 20.6 或更高版本、npm。

```powershell
npm ci
Copy-Item .env.example .env.local
```

编辑 `.env.local`，填写 `XJ_API_KEY`、`APP_USERNAME`、`APP_PASSWORD` 和随机的 `APP_SESSION_SECRET`。然后运行：

```powershell
npm run dev
```

打开 `http://localhost:3000`。生产模式可用 `npm run build` 和 `npm start` 启动。SQLite 数据默认写入 `data/app.db`；更换设备或重新部署时，需要保留该文件或配置持久化磁盘。

## 检查

```powershell
npm test -- --run
npx tsc --noEmit
npm run build
npm run smoke
```

`npm run smoke` 会登录、读取受保护的项目接口，并创建后删除一条临时会话。运行前需让生产服务器使用同一份 `.env.local`。

## GitHub 与托管

GitHub 仓库保存源码，不直接运行 Next.js 服务端或 SQLite。仓库包含 `Dockerfile` 和 `render.yaml`，可在支持 Docker 与持久化磁盘的 Node 托管平台上导入 Blueprint。部署时设置 `XJ_API_KEY`、`APP_USERNAME` 和 `APP_PASSWORD`，并将数据库路径挂载到持久化磁盘；`APP_SESSION_SECRET` 由 Render 配置自动生成。不要把 `.env.local` 或数据库文件提交到仓库。

Render 配置使用 1 GB 持久化磁盘和 Starter Web Service；创建线上服务前应在 Render 确认账户、区域及当前费用。没有托管平台凭据时，可在本机启动服务并使用临时隧道验收，但隧道地址只在本机服务运行期间有效。

## GitHub Pages 手机聊天版

如果只需要个人 AI 对话，可直接发布 `site/` 静态版本：GitHub Pages 托管页面，Cloudflare Worker 代理模型接口，聊天历史只保存在当前手机浏览器。完整步骤见 `site/README.md` 和 `worker/README.md`。

1. 在 Cloudflare 部署 `worker/`，设置 `XJ_API_KEY`、`APP_USERNAME`、`APP_PASSWORD`、`APP_SESSION_SECRET` 四个 secret，并把 `WEB_ORIGIN` 设置为 Pages 来源（例如 `https://liotewen.github.io`，不带 `/LT001` 路径）。
2. 将 Worker 的 `workers.dev` 地址填入 `site/config.js`。
3. 推送到 `main`，`.github/workflows/deploy-pages.yml` 会发布 `site/`。

GitHub Pages 本身不能安全保存模型 API Key；不要把密钥写入 `site/`、GitHub Actions 日志或仓库文件。
