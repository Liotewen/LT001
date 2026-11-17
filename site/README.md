# GitHub Pages 静态聊天站

`site/` 是无构建依赖的手机优先聊天页面。它只把对话保存到当前浏览器的 `localStorage`，模型请求通过 Cloudflare Pages API 入口转到原 Worker 完成。入口部署见 `cloudflare-pages/README.md`。

发布前编辑 `config.js`：

```js
window.LT_CONFIG = {
  workerUrl: 'https://lt-ai-chat-proxy.pages.dev',
};
```

不要在这个文件或任何静态资源中写入模型 API Key、账号密码或 Cloudflare token。

页面支持新建、切换、删除对话、思考深度选择、流式回复，以及 JSON 导出/导入备份。清理浏览器站点数据会同时清理本机历史。

在输入框左下角点“上传图片”，可选择截图或照片并带图提问，每条最多 4 张。支持 JPG、PNG、WebP 和 GIF（取静态画面），原图最大 20 MB；浏览器会转为压缩图片，去除原图元数据，再通过受保护的聊天接口发送。点消息中的图片可放大查看。不填写问题时会默认请求分析图片。

已发送图片与文字一起保存在原来的浏览器存储中，后续追问会继续携带当前对话的图片，JSON 备份也包含图片；旧版纯文字记录可直接读取。未发送图片按当前对话暂存于内存，刷新会清除。浏览器存储空间有限，出现空间不足提示时请先导出备份，未能保存的内容刷新后会丢失。

已发布地址：<https://liotewen.github.io/LT001/>。手机浏览器可将网页添加到主屏幕，建议固定使用同一浏览器并定期导出备份。不同对话分别保留各自上下文，不自动读取其他对话；更换设备需要手动导入备份。

登录会话使用当前标签页的 `sessionStorage`，不依赖第三方 Cookie。账号、密码及模型 API Key 只配置在 Worker secrets 中。托管使用 GitHub Pages 与 Cloudflare Workers 免费额度，模型请求按聚合 API 的实际用量计费。
