'use client';

import { useEffect, useRef, useState } from 'react';
import { Layers3, Menu, PanelLeft, Settings2, Sparkles, X } from 'lucide-react';
import { ActionDialog, type DialogConfig } from '@/components/ActionDialog';
import { Composer, type ComposerPayload } from '@/components/Composer';
import { ImageTaskCard } from '@/components/ImageTaskCard';
import { LoginScreen } from '@/components/LoginScreen';
import { MessageBubble } from '@/components/MessageBubble';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { Sidebar } from '@/components/Sidebar';
import type { ConversationView } from '@/lib/ui-types';
import type { ImageTask, Message, Project } from '@/lib/repositories';
import type { ReasoningEffort } from '@/lib/validation';

type AppStatus = 'checking' | 'login' | 'ready';

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return new Error(body?.error?.message || `请求失败 (${response.status})`);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  if (!response.ok) throw await responseError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createMessage(conversationId: string, role: Message['role'], content: string, status: Message['status'] = 'complete'): Message {
  return { id: newId(), conversation_id: conversationId, role, content, image_url: null, status, created_at: new Date().toISOString() };
}

export function Workspace() {
  const [status, setStatus] = useState<AppStatus>('checking');
  const [username, setUsername] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [current, setCurrent] = useState<ConversationView | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [imageTasks, setImageTasks] = useState<ImageTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [archivedView, setArchivedView] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('medium');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [composerBusy, setComposerBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [initializingWorkspace, setInitializingWorkspace] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  const activePolls = useRef(new Set<string>());
  const abortController = useRef<AbortController | null>(null);

  async function refreshLists(projectId: string | null, archived: boolean) {
    const conversationParams = new URLSearchParams();
    if (projectId) conversationParams.set('projectId', projectId);
    if (archived) conversationParams.set('archived', 'true');
    const conversationQuery = conversationParams.toString();
    const [nextProjects, nextConversations] = await Promise.all([
      requestJson<Project[]>(`/api/projects${archived ? '?archived=true' : ''}`),
      requestJson<ConversationView[]>(`/api/conversations${conversationQuery ? `?${conversationQuery}` : ''}`),
    ]);
    setProjects(nextProjects);
    setConversations(nextConversations);
    return nextConversations;
  }

  async function fetchConversation(id: string) {
    const result = await requestJson<ConversationView>(`/api/conversations/${encodeURIComponent(id)}`);
    setCurrent(result);
    setMessages(result.messages || []);
    setImageTasks(result.imageTasks || []);
    setReasoningEffort(result.reasoning_effort);
    setSelectedId(id);
    selectedIdRef.current = id;
    try { localStorage.setItem('lt-last-conversation', id); } catch { /* Storage can be disabled. */ }
    return result;
  }

  async function selectConversation(id: string) {
    setNotice(null);
    try {
      const result = await fetchConversation(id);
      setSidebarOpen(false);
      result.imageTasks?.filter((task) => task.status === 'pending' || task.status === 'processing')
        .forEach((task) => void pollImageTask(task.id, id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法打开对话');
    }
  }

  async function initializeWorkspace() {
    setInitializingWorkspace(true);
    try {
      const list = await refreshLists(null, false);
      let lastId: string | null = null;
      try { lastId = localStorage.getItem('lt-last-conversation'); } catch { /* Storage can be disabled. */ }
      const selected = list.some((item) => item.id === lastId) ? lastId : list[0]?.id;
      if (selected) await fetchConversation(selected);
      else {
        setCurrent(null);
        setSelectedId(null);
        selectedIdRef.current = null;
        setMessages([]);
      }
      setStatus('ready');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '工作区加载失败');
      setStatus('ready');
    } finally {
      setInitializingWorkspace(false);
    }
  }

  useEffect(() => {
    let alive = true;
    async function boot() {
      const response = await fetch('/api/auth/me', { cache: 'no-store' }).catch(() => null);
      if (!alive) return;
      if (!response?.ok) {
        setStatus('login');
        return;
      }
      const user = await response.json().catch(() => ({})) as { username?: string };
      setUsername(user.username || 'owner');
      await initializeWorkspace();
    }
    void boot();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, imageTasks]);

  async function login(user: string, password: string) {
    setLoginBusy(true);
    setLoginError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: user, password }),
      });
      if (!response.ok) throw await responseError(response);
      const result = await response.json() as { username: string };
      setUsername(result.username);
      await initializeWorkspace();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : '登录失败，请重试');
    } finally {
      setLoginBusy(false);
    }
  }

  async function createConversation() {
    setNotice(null);
    try {
      const projectId = !archivedView ? selectedProjectId : null;
      const created = await requestJson<ConversationView>('/api/conversations', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, reasoningEffort }),
      });
      setArchivedView(false);
      await refreshLists(projectId, false);
      await fetchConversation(created.id);
      setSidebarOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法新建对话');
    }
  }

  async function createProject(name: string) {
    await requestJson<Project>('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
    });
    setDialog(null);
    await refreshLists(selectedProjectId, archivedView);
  }

  function openNewProjectDialog() {
    setDialog({ title: '新建项目', description: '给项目起一个容易识别的名字。', inputLabel: '项目名称', confirmLabel: '创建项目', onConfirm: createProject });
  }

  function renameConversation(conversation: ConversationView) {
    setDialog({
      title: '重命名对话', description: '对话历史会保留在当前项目中。', inputLabel: '对话名称', value: conversation.title,
      confirmLabel: '保存名称', onConfirm: async (title) => {
        await requestJson(`/api/conversations/${conversation.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
        });
        setDialog(null);
        await refreshLists(selectedProjectId, archivedView);
        if (selectedId === conversation.id) await fetchConversation(conversation.id);
      },
    });
  }

  function confirmDeleteConversation(conversation: ConversationView) {
    setDialog({
      title: '删除这段对话？', description: '对话及其中的消息会被永久删除。', confirmLabel: '删除对话', danger: true,
      onConfirm: async () => {
        await requestJson(`/api/conversations/${conversation.id}`, { method: 'DELETE' });
        if (selectedId === conversation.id) {
          setCurrent(null); setMessages([]); setImageTasks([]); setSelectedId(null); selectedIdRef.current = null;
          try { localStorage.removeItem('lt-last-conversation'); } catch { /* Storage can be disabled. */ }
        }
        setDialog(null);
        const list = await refreshLists(selectedProjectId, archivedView);
        if (selectedId === conversation.id && list[0]) await selectConversation(list[0].id);
      },
    });
  }

  function confirmDeleteProject(project: Project) {
    setDialog({
      title: '删除这个项目？', description: '项目会被删除，对话将移动到“全部对话”。', confirmLabel: '删除项目', danger: true,
      onConfirm: async () => {
        await requestJson(`/api/projects/${project.id}`, { method: 'DELETE' });
        const filter = selectedProjectId === project.id ? null : selectedProjectId;
        if (selectedProjectId === project.id) setSelectedProjectId(null);
        setDialog(null);
        await refreshLists(filter, archivedView);
      },
    });
  }

  async function archiveConversation(conversation: ConversationView) {
    try {
      await requestJson(`/api/conversations/${conversation.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: !archivedView }),
      });
      if (selectedId === conversation.id) {
        setCurrent(null); setMessages([]); setImageTasks([]); setSelectedId(null); selectedIdRef.current = null;
      }
      const list = await refreshLists(selectedProjectId, archivedView);
      if (selectedId === conversation.id && list[0]) await selectConversation(list[0].id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法更新归档状态');
    }
  }

  async function archiveProject(project: Project) {
    try {
      await requestJson(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: !archivedView }),
      });
      const filter = selectedProjectId === project.id ? null : selectedProjectId;
      if (selectedProjectId === project.id) setSelectedProjectId(null);
      await refreshLists(filter, archivedView);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法更新项目状态');
    }
  }

  async function selectProject(projectId: string | null) {
    setSelectedProjectId(projectId);
    setCurrent(null); setMessages([]); setImageTasks([]); setSelectedId(null); selectedIdRef.current = null;
    try {
      const list = await refreshLists(projectId, archivedView);
      if (list[0]) await selectConversation(list[0].id);
      else setSidebarOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法加载项目');
    }
  }

  async function toggleArchived() {
    const next = !archivedView;
    setArchivedView(next);
    setSelectedProjectId(null);
    setCurrent(null); setMessages([]); setImageTasks([]); setSelectedId(null); selectedIdRef.current = null;
    try {
      const list = await refreshLists(null, next);
      if (list[0]) await selectConversation(list[0].id);
      else setSidebarOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法加载归档内容');
    }
  }

  async function ensureConversation() {
    if (current) return current;
    const created = await requestJson<ConversationView>('/api/conversations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: archivedView ? null : selectedProjectId, reasoningEffort }),
    });
    setArchivedView(false);
    await refreshLists(archivedView ? null : selectedProjectId, false);
    await fetchConversation(created.id);
    return created;
  }

  async function consumeChatStream(response: Response, conversationId: string, assistantId: string) {
    if (!response.body) throw new Error('模型没有返回内容');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let finalId = assistantId;
    const processBlock = (block: string) => {
      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) return;
      const payload = JSON.parse(dataLines.join('\n')) as { content?: string; messageId?: string | null; code?: string; message?: string };
      if (eventName === 'delta' && payload.content) {
        fullContent += payload.content;
        setMessages((items) => items.map((message) => message.id === assistantId ? { ...message, content: fullContent } : message));
      } else if (eventName === 'error') {
        throw new Error(payload.message || '模型生成失败');
      } else if (eventName === 'done' && payload.messageId) {
        finalId = payload.messageId;
      }
    };
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true }).replace(/\r\n/g, '\n');
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';
      for (const block of blocks) processBlock(block);
    }
    buffer += decoder.decode();
    if (buffer.trim()) processBlock(buffer);
    setMessages((items) => items.map((message) => message.id === assistantId ? { ...message, id: finalId, content: fullContent, status: 'complete' } : message));
    const latest = await requestJson<ConversationView>(`/api/conversations/${conversationId}`);
    setCurrent(latest);
    setConversations((items) => items.map((conversation) => conversation.id === conversationId ? latest : conversation));
  }

  async function pollImageTask(taskId: string, conversationId: string) {
    if (activePolls.current.has(taskId)) return;
    activePolls.current.add(taskId);
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2200));
        const task = await requestJson<ImageTask>(`/api/images/${taskId}`);
        if (selectedIdRef.current === conversationId) {
          setImageTasks((items) => items.map((item) => item.id === task.id ? task : item));
        }
        if (task.status === 'complete' || task.status === 'error') {
          if (selectedIdRef.current === conversationId) await fetchConversation(conversationId);
          return;
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '图片状态暂时无法读取');
    } finally {
      activePolls.current.delete(taskId);
    }
  }

  async function send(payload: ComposerPayload) {
    setNotice(null);
    if (payload.mode === 'image') {
      setComposerBusy(true);
      try {
        const conversation = await ensureConversation();
        const result = await requestJson<ImageTask | ImageTask[]>('/api/images', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ conversationId: conversation.id, prompt: payload.prompt, size: payload.size, count: payload.count }),
        });
        const tasks = Array.isArray(result) ? result : [result];
        if (selectedIdRef.current === conversation.id) {
          setImageTasks((items) => [...tasks, ...items.filter((item) => !tasks.some((task) => task.id === item.id))]);
        }
        if (tasks.some((task) => task.status === 'complete')) await fetchConversation(conversation.id);
        tasks.filter((task) => task.status === 'pending' || task.status === 'processing')
          .forEach((task) => void pollImageTask(task.id, conversation.id));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '图片生成失败，请稍后重试');
        throw error;
      } finally {
        setComposerBusy(false);
      }
      return;
    }

    const conversation = await ensureConversation();
    setComposerBusy(true);
    const userMessage = createMessage(conversation.id, 'user', payload.content, 'pending');
    setMessages((items) => [...items, userMessage]);
    abortController.current = new AbortController();
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id, content: payload.content, reasoningEffort: payload.reasoningEffort }),
        signal: abortController.current.signal,
      });
      if (!response.ok) throw await responseError(response);
      setMessages((items) => items.map((message) => message.id === userMessage.id ? { ...message, status: 'complete' } : message));
      const assistant = createMessage(conversation.id, 'assistant', '', 'pending');
      setMessages((items) => [...items, assistant]);
      await consumeChatStream(response, conversation.id, assistant.id);
      await refreshLists(selectedProjectId, false);
    } catch (error) {
      setMessages((items) => items.map((message) => message.id === userMessage.id ? { ...message, status: 'error' } : message));
      setNotice(error instanceof Error ? error.message : '消息发送失败');
      throw error;
    } finally {
      setComposerBusy(false);
      abortController.current = null;
    }
  }

  async function changeEffort(effort: ReasoningEffort) {
    setReasoningEffort(effort);
    if (!current) return;
    try {
      const updated = await requestJson<ConversationView>(`/api/conversations/${current.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reasoningEffort: effort }),
      });
      setCurrent({ ...current, reasoning_effort: updated.reasoning_effort });
      setConversations((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法保存思考深度');
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setStatus('login');
    setUsername(''); setProjects([]); setConversations([]); setCurrent(null); setMessages([]); setImageTasks([]);
    setSelectedId(null); selectedIdRef.current = null;
    try { localStorage.removeItem('lt-last-conversation'); } catch { /* Storage can be disabled. */ }
  }

  if (status === 'checking' || initializingWorkspace) {
    return <main className="boot-screen"><span className="brand-mark">LT</span><span className="loading-label">正在打开工作区</span></main>;
  }
  if (status === 'login') return <LoginScreen onLogin={(user, password) => void login(user, password)} busy={loginBusy} error={loginError} />;

  const currentProject = projects.find((project) => project.id === current?.project_id);
  const title = current?.title || (archivedView ? '已归档对话' : '新对话');
  const pendingImages = imageTasks.filter((task) => task.status !== 'complete');

  return (
    <main className="workspace-shell">
      <Sidebar
        open={sidebarOpen} onClose={() => setSidebarOpen(false)} projects={projects} conversations={conversations}
        selectedId={selectedId} selectedProjectId={selectedProjectId} archivedView={archivedView} username={username}
        onSelect={(id) => void selectConversation(id)} onProjectSelect={(id) => void selectProject(id)}
        onNewConversation={() => void createConversation()} onNewProject={openNewProjectDialog}
        onToggleArchived={() => void toggleArchived()} onRenameConversation={renameConversation}
        onArchiveConversation={(conversation) => void archiveConversation(conversation)}
        onDeleteConversation={confirmDeleteConversation} onArchiveProject={(project) => void archiveProject(project)}
        onDeleteProject={confirmDeleteProject} onLogout={() => void logout()}
      />

      <section className="workspace-main">
        <header className="workspace-topbar">
          <button className="icon-button mobile-menu-button" aria-label="打开导航" title="打开导航" onClick={() => setSidebarOpen(true)}><PanelLeft size={19} /></button>
          <div className="workspace-breadcrumb">
            <span className="breadcrumb-project">{currentProject?.name || 'LT Workspace'}</span><span className="breadcrumb-divider">/</span><strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="model-pill"><span className="status-dot" />gpt-6.1-sol</span>
            <button className={`icon-button settings-trigger ${settingsOpen ? 'control-active' : ''}`} aria-label="会话设置" title="会话设置" onClick={() => setSettingsOpen(true)}><Settings2 size={18} /></button>
          </div>
        </header>

        <div className="chat-scroll" key={selectedId || 'empty'}>
          <div className="conversation-content">
            {notice && <div className="notice-banner" role="status"><span>{notice}</span><button className="small-icon-button" title="关闭提示" aria-label="关闭提示" onClick={() => setNotice(null)}><X size={15} /></button></div>}
            {messages.length === 0 && pendingImages.length === 0 ? (
              <div className="empty-conversation">
                <div className="empty-emblem"><Sparkles size={21} /></div>
                <p className="eyebrow">{currentProject ? currentProject.name : 'LT AI WORKSPACE'}</p>
                <h1>{current ? current.title : '今天想做什么？'}</h1>
                <div className="starter-prompts">
                  <button onClick={() => setSettingsOpen(true)}><Layers3 size={16} /><span>继续项目里的思路</span></button>
                  <button onClick={() => setSettingsOpen(true)}><Sparkles size={16} /><span>用深度思考拆解问题</span></button>
                </div>
              </div>
            ) : (
              <div className="message-list">
                {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
                {pendingImages.map((task) => <ImageTaskCard key={task.id} task={task} onRetry={(failed) => void send({ mode: 'image', prompt: failed.prompt, size: '1024x1024', count: 1 })} />)}
              </div>
            )}
            <div ref={scrollEndRef} />
          </div>
        </div>

        <Composer
          onSend={send} busy={composerBusy} reasoningEffort={reasoningEffort}
          onEffortChange={(effort) => void changeEffort(effort)}
          onStop={() => abortController.current?.abort()}
        />
        <div className="mobile-context-line"><span className="status-dot" />{current ? `${messages.length} 条消息已载入` : '选择或新建一段对话'}</div>
      </section>

      <SettingsDrawer
        open={settingsOpen} onClose={() => setSettingsOpen(false)} reasoningEffort={reasoningEffort}
        onEffortChange={(effort) => void changeEffort(effort)} messageCount={messages.length}
        projectName={currentProject?.name || ''}
      />
      {dialog && <ActionDialog dialog={dialog} onClose={() => setDialog(null)} />}
    </main>
  );
}
