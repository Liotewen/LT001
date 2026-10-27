import {
  STORAGE_KEY,
  appendMessage,
  buildChatPayload,
  createConversation,
  isValidState,
  readState,
  removeConversation,
  selectedConversation,
  serializeState,
  writeState,
} from './state.mjs';

const root = document.querySelector('#app');
const config = globalThis.LT_CONFIG || {};
const workerUrl = String(config.workerUrl || '').replace(/\/+$/, '');
let state;
let currentUser = '';
let draft = '';
let isBusy = false;
let streamingText = '';
let notice = '';
let drawerOpen = false;

function isConfigured() {
  return /^https:\/\//.test(workerUrl) && !workerUrl.includes('YOUR-WORKER');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function messageHtml(message) {
  const label = message.role === 'user' ? '你' : 'LT AI';
  return `<article class="message-row ${message.role}">
    <div class="message-avatar">${message.role === 'user' ? '你' : 'LT'}</div>
    <div class="message-content"><div class="message-meta"><strong>${label}</strong><time>${formatTime(message.createdAt)}</time></div><div class="message-text">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div></div>
  </article>`;
}

function persist() {
  try {
    writeState(state);
    notice = notice === '本机存储不可用，刷新后可能丢失当前对话。' ? '' : notice;
  } catch {
    notice = '本机存储不可用，刷新后可能丢失当前对话。';
  }
}

function showLogin(error = '') {
  isBusy = false;
  root.className = 'login-page';
  root.innerHTML = `<main class="login-card" aria-labelledby="login-title">
    <div class="login-brand"><div class="brand-mark">LT</div><span>私人 AI 空间</span></div>
    <div class="login-copy"><p class="eyebrow">PRIVATE CHAT / MOBILE FIRST</p><h1 id="login-title">欢迎回来</h1><p>你的对话只保存在当前设备浏览器里。</p></div>
    <form id="login-form" class="login-form">
      <label>账号<input id="username" name="username" autocomplete="username" required maxlength="120" placeholder="输入账号"></label>
      <label>密码<input id="password" name="password" type="password" autocomplete="current-password" required maxlength="240" placeholder="输入密码"></label>
      <button class="primary-button" type="submit">进入空间<span aria-hidden="true">→</span></button>
      <p class="form-error" id="login-error" role="alert">${escapeHtml(error || (isConfigured() ? '' : '请先在 site/config.js 填写 Worker 地址。'))}</p>
    </form>
    <p class="login-note"><span class="status-dot"></span>加密会话 · 本机历史</p>
  </main>`;
  const form = document.querySelector('#login-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorNode = document.querySelector('#login-error');
    const button = form.querySelector('button');
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!isConfigured()) {
      errorNode.textContent = '请先在 site/config.js 填写 Worker 地址。';
      return;
    }
    button.disabled = true;
    errorNode.textContent = '';
    try {
      const response = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      if (!response.ok) throw await responseError(response);
      const result = await response.json();
      currentUser = result.username || username;
      state = readState();
      ensureConversation();
      renderApp();
    } catch (error) {
      errorNode.textContent = error.message || '登录失败，请稍后重试';
      button.disabled = false;
    }
  });
}

function ensureConversation() {
  if (!state || !state.conversations.length) createConversation(state);
  if (!selectedConversation(state)) state.selectedId = state.conversations[0].id;
  persist();
}

function effortLabel(effort) {
  return { low: '轻度', medium: '标准', high: '深度' }[effort] || '标准';
}

function renderApp() {
  ensureConversation();
  const conversation = selectedConversation(state);
  const list = state.conversations.map((item) => `<button class="conversation-item ${item.id === state.selectedId ? 'selected' : ''}" data-conversation="${escapeHtml(item.id)}"><span>${escapeHtml(item.title)}</span><time>${formatTime(item.updatedAt)}</time></button>`).join('');
  const messages = conversation.messages.map(messageHtml).join('');
  const streaming = streamingText ? messageHtml({ role: 'assistant', content: streamingText, createdAt: new Date().toISOString() }) : '';
  root.className = `app-page ${drawerOpen ? 'drawer-open' : ''}`;
  root.innerHTML = `<div class="app-shell">
    <div class="drawer-scrim" id="drawer-scrim"></div>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-head"><div class="brand-lockup"><div class="brand-mark">LT</div><div><strong>LT AI</strong><span>私人对话空间</span></div></div><button class="icon-button mobile-only" id="close-drawer" aria-label="关闭对话列表">×</button></div>
      <button class="new-chat" id="new-chat"><span>＋</span>新对话</button>
      <div class="conversation-heading"><span>最近对话</span><small>${state.conversations.length}</small></div>
      <nav class="conversation-list" aria-label="对话列表">${list || '<p class="empty-list">还没有对话</p>'}</nav>
      <div class="sidebar-foot"><button class="text-button" id="export-chat">导出备份</button><button class="text-button" id="import-chat">导入备份</button><input id="import-file" type="file" accept="application/json" hidden><div class="account-row"><span class="account-avatar">${escapeHtml((currentUser || 'U').slice(0, 1).toUpperCase())}</span><span class="account-name">${escapeHtml(currentUser || '已登录')}</span><button class="icon-button" id="logout" aria-label="退出登录">↪</button></div></div>
    </aside>
    <main class="chat-panel">
      <header class="topbar"><button class="icon-button mobile-only" id="open-drawer" aria-label="打开对话列表">☰</button><div class="title-block"><span>当前对话</span><h1>${escapeHtml(conversation.title)}</h1></div><div class="top-actions"><span class="model-pill">gpt-6.1-sol</span><button class="icon-button" id="delete-chat" aria-label="删除当前对话">⌫</button><select id="effort" aria-label="思考深度"><option value="low" ${conversation.reasoningEffort === 'low' ? 'selected' : ''}>轻度思考</option><option value="medium" ${conversation.reasoningEffort === 'medium' ? 'selected' : ''}>标准思考</option><option value="high" ${conversation.reasoningEffort === 'high' ? 'selected' : ''}>深度思考</option></select></div></header>
      <section class="message-scroller" id="message-scroller" aria-live="polite">${conversation.messages.length || streamingText ? `${messages}${streaming}` : '<div class="empty-chat"><div class="empty-icon">✦</div><h2>从一个问题开始</h2><p>我会记住这段对话中的上下文。你也可以随时切换思考深度。</p><div class="suggestions"><button data-suggestion="帮我梳理一个今天可以完成的计划">梳理今天的计划</button><button data-suggestion="帮我把一个想法变成清晰的方案">把想法变成方案</button></div></div>'}</section>
      ${notice ? `<div class="notice" role="status">${escapeHtml(notice)}</div>` : ''}
      <form class="composer" id="chat-form"><textarea id="prompt" rows="1" maxlength="20000" placeholder="写下你的问题…" ${isBusy ? 'disabled' : ''}>${escapeHtml(draft)}</textarea><div class="composer-foot"><span>Enter 发送 · Shift + Enter 换行</span><button class="send-button" type="submit" ${isBusy ? 'disabled' : ''} aria-label="发送">${isBusy ? '<span class="spinner"></span>' : '↑'}</button></div></form>
      <p class="privacy-note">对话历史仅保存在这部设备的浏览器中 · <button id="clear-notice" class="link-button">了解本地备份</button></p>
    </main>
  </div>`;
  bindAppEvents();
  const scroller = document.querySelector('#message-scroller');
  scroller.scrollTop = scroller.scrollHeight;
}

function bindAppEvents() {
  document.querySelector('#open-drawer')?.addEventListener('click', () => { drawerOpen = true; renderApp(); });
  document.querySelector('#close-drawer')?.addEventListener('click', () => { drawerOpen = false; renderApp(); });
  document.querySelector('#drawer-scrim')?.addEventListener('click', () => { drawerOpen = false; renderApp(); });
  document.querySelector('#new-chat')?.addEventListener('click', () => { createConversation(state); notice = ''; drawerOpen = false; persist(); renderApp(); focusPrompt(); });
  document.querySelectorAll('[data-conversation]').forEach((button) => button.addEventListener('click', () => {
    state.selectedId = button.dataset.conversation;
    notice = '';
    drawerOpen = false;
    persist();
    renderApp();
  }));
  document.querySelectorAll('[data-suggestion]').forEach((button) => button.addEventListener('click', () => {
    draft = button.dataset.suggestion;
    focusPrompt();
  }));
  document.querySelector('#delete-chat')?.addEventListener('click', () => {
    const conversation = selectedConversation(state);
    if (!conversation || !window.confirm(`删除“${conversation.title}”？`)) return;
    removeConversation(state, conversation.id);
    ensureConversation();
    notice = '对话已删除。';
    persist();
    renderApp();
  });
  document.querySelector('#effort')?.addEventListener('change', (event) => {
    const conversation = selectedConversation(state);
    conversation.reasoningEffort = event.target.value;
    persist();
    renderApp();
  });
  document.querySelector('#chat-form')?.addEventListener('submit', (event) => { event.preventDefault(); void sendMessage(); });
  const prompt = document.querySelector('#prompt');
  prompt?.addEventListener('input', () => { draft = prompt.value; prompt.style.height = 'auto'; prompt.style.height = `${Math.min(prompt.scrollHeight, 180)}px`; });
  prompt?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void sendMessage(); }
  });
  document.querySelector('#logout')?.addEventListener('click', () => void logout());
  document.querySelector('#export-chat')?.addEventListener('click', exportBackup);
  document.querySelector('#import-chat')?.addEventListener('click', () => document.querySelector('#import-file').click());
  document.querySelector('#import-file')?.addEventListener('change', importBackup);
  document.querySelector('#clear-notice')?.addEventListener('click', () => { notice = '备份会下载为 JSON 文件，可在另一台浏览器手动导入。'; renderApp(); });
}

function focusPrompt() {
  const prompt = document.querySelector('#prompt');
  prompt?.focus();
}

async function sendMessage() {
  const content = draft.trim();
  const conversation = selectedConversation(state);
  if (!content || !conversation || isBusy) return;
  appendMessage(state, conversation.id, 'user', content);
  draft = '';
  streamingText = '';
  notice = '';
  isBusy = true;
  persist();
  renderApp();
  let authExpired = false;
  try {
    const response = await api('/api/chat', { method: 'POST', body: JSON.stringify(buildChatPayload(conversation, conversation.reasoningEffort)) });
    if (response.status === 401) { authExpired = true; currentUser = ''; showLogin('登录已过期，请重新登录。'); return; }
    if (!response.ok) throw await responseError(response);
    await consumeStream(response);
    if (streamingText) appendMessage(state, conversation.id, 'assistant', streamingText);
  } catch (error) {
    if (streamingText) appendMessage(state, conversation.id, 'assistant', `${streamingText}\n\n（本次响应未完整结束，可继续提问。）`);
    notice = error.message || '模型请求失败，请稍后重试。';
  } finally {
    streamingText = '';
    isBusy = false;
    persist();
    if (!authExpired) renderApp();
  }
}

async function consumeStream(response) {
  if (!response.body) throw new Error('模型没有返回内容。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let data = [];
  const flushEvent = () => {
    if (!data.length) return;
    const raw = data.join('\n');
    data = [];
    if (eventName === 'delta') {
      try { streamingText += JSON.parse(raw).content || ''; renderMessagesOnly(); } catch { /* Ignore malformed provider chunks. */ }
    } else if (eventName === 'error') {
      let message = '模型请求失败，请稍后重试。';
      try { message = JSON.parse(raw).message || message; } catch { /* Keep the safe fallback. */ }
      throw new Error(message);
    }
    eventName = 'message';
  };
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    buffer += decoder.decode(result.value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (!line) flushEvent();
      else if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
      newline = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) { if (buffer.startsWith('data:')) data.push(buffer.slice(5).trim()); flushEvent(); }
}

function renderMessagesOnly() {
  const conversation = selectedConversation(state);
  const node = document.querySelector('#message-scroller');
  if (!node || !conversation) return;
  const messages = conversation.messages.map(messageHtml).join('');
  const streaming = streamingText ? messageHtml({ role: 'assistant', content: streamingText, createdAt: new Date().toISOString() }) : '';
  node.innerHTML = `${messages}${streaming}`;
  node.scrollTop = node.scrollHeight;
}

async function responseError(response) {
  try {
    const payload = await response.json();
    return new Error(payload.error?.message || `请求失败（${response.status}）`);
  } catch {
    return new Error(`请求失败（${response.status}）`);
  }
}

function api(path, options = {}) {
  if (!isConfigured()) return Promise.reject(new Error('请先在 site/config.js 填写 Worker 地址。'));
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(`${workerUrl}${path}`, { ...options, headers, credentials: 'include' });
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* Local logout still clears the screen. */ }
  currentUser = '';
  showLogin();
}

function exportBackup() {
  const blob = new Blob([serializeState(state)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `lt-ai-chat-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  notice = '备份已下载到本机。';
  renderApp();
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!isValidState(imported)) throw new Error('备份文件格式不正确。');
    state = imported;
    ensureConversation();
    notice = '备份已导入。';
    renderApp();
  } catch (error) {
    notice = error.message || '备份导入失败。';
    renderApp();
  }
}

async function checkSession() {
  if (!isConfigured()) { showLogin(); return; }
  try {
    const response = await api('/api/auth/me');
    if (!response.ok) throw new Error('请登录');
    const result = await response.json();
    currentUser = result.username || '';
    state = readState();
    ensureConversation();
    renderApp();
  } catch {
    showLogin();
  }
}

// Keep the storage key discoverable for support and browser privacy tools.
document.documentElement.dataset.storageKey = STORAGE_KEY;
checkSession();
