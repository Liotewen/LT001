# GitHub Pages 静态聊天站

`site/` 是无构建依赖的手机优先聊天页面。它只把对话保存到当前浏览器的 `localStorage`，模型请求通过 Cloudflare Worker 完成。

发布前编辑 `config.js`：

```js
window.LT_CONFIG = {
  workerUrl: 'https://你的-worker.workers.dev',
};
```

不要在这个文件或任何静态资源中写入模型 API Key、账号密码或 Cloudflare token。

页面支持新建、切换、删除对话、思考深度选择、流式回复，以及 JSON 导出/导入备份。清理浏览器站点数据会同时清理本机历史。
