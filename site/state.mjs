export const STORAGE_KEY = 'lt-chat-state-v1';
export const STATE_VERSION = 1;
const EFFORTS = new Set(['low', 'medium', 'high']);

function defaultNow() {
  return new Date().toISOString();
}

function defaultId() {
  return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptyState(_now = defaultNow) {
  return { version: STATE_VERSION, selectedId: null, conversations: [] };
}

function cleanState(state) {
  const copy = { version: STATE_VERSION, selectedId: state.selectedId || null, conversations: state.conversations };
  if (!copy.conversations.some((conversation) => conversation.id === copy.selectedId)) copy.selectedId = copy.conversations[0]?.id || null;
  return copy;
}

function validMessage(value) {
  return value && typeof value === 'object'
    && typeof value.id === 'string'
    && (value.role === 'user' || value.role === 'assistant')
    && typeof value.content === 'string'
    && typeof value.createdAt === 'string';
}

function validConversation(value) {
  return value && typeof value === 'object'
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
    && EFFORTS.has(value.reasoningEffort)
    && Array.isArray(value.messages)
    && value.messages.every(validMessage);
}

export function isValidState(value) {
  return Boolean(value)
    && typeof value === 'object'
    && value.version === STATE_VERSION
    && (value.selectedId === null || typeof value.selectedId === 'string')
    && Array.isArray(value.conversations)
    && value.conversations.every(validConversation);
}

export function createConversation(state, idFactory = defaultId, nowFactory = defaultNow) {
  const now = nowFactory();
  const conversation = {
    id: idFactory(),
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    reasoningEffort: 'medium',
    messages: [],
  };
  state.conversations.unshift(conversation);
  state.selectedId = conversation.id;
  return conversation;
}

export function appendMessage(state, conversationId, role, content, idFactory = defaultId, nowFactory = defaultNow) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) throw new Error('会话不存在');
  const message = { id: idFactory(), role, content, createdAt: nowFactory() };
  conversation.messages.push(message);
  conversation.updatedAt = message.createdAt;
  if (role === 'user' && conversation.title === '新对话') {
    conversation.title = content.trim().replace(/\s+/g, ' ').slice(0, 28) || '新对话';
  }
  return message;
}

export function removeConversation(state, conversationId) {
  state.conversations = state.conversations.filter((conversation) => conversation.id !== conversationId);
  if (state.selectedId === conversationId) state.selectedId = state.conversations[0]?.id || null;
}

export function selectedConversation(state) {
  return state.conversations.find((conversation) => conversation.id === state.selectedId) || null;
}

export function buildChatPayload(conversation, reasoningEffort = conversation.reasoningEffort) {
  const effort = EFFORTS.has(reasoningEffort) ? reasoningEffort : 'medium';
  return {
    messages: conversation.messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role, content: message.content })),
    reasoningEffort: effort,
  };
}

export function serializeState(state) {
  const output = cleanState({ version: STATE_VERSION, selectedId: state.selectedId, conversations: state.conversations });
  return JSON.stringify(output, null, 2);
}

export function loadState(raw, nowFactory = defaultNow) {
  try {
    const parsed = JSON.parse(raw || 'null');
    if (isValidState(parsed)) return cleanState(parsed);
  } catch {
    // A corrupt local backup is replaced with a clean state and reported by the UI.
  }
  const state = emptyState(nowFactory);
  createConversation(state, defaultId, nowFactory);
  return state;
}

export function readState(storage = globalThis.localStorage, nowFactory = defaultNow) {
  try {
    return loadState(storage.getItem(STORAGE_KEY), nowFactory);
  } catch {
    return loadState(null, nowFactory);
  }
}

export function writeState(state, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, serializeState(state));
}
