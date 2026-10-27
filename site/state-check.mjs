import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendMessage,
  buildChatPayload,
  createConversation,
  emptyState,
  loadState,
  serializeState,
} from './state.mjs';

test('normalizes invalid storage into a fresh local state', () => {
  const state = loadState('{"version":99,"conversations":"bad"}', () => '2026-01-01T00:00:00.000Z');
  assert.equal(state.version, 1);
  assert.equal(state.conversations.length, 1);
  assert.equal(state.conversations[0].title, '新对话');
});

test('keeps the full ordered context in chat payloads', () => {
  const state = emptyState(() => '2026-01-01T00:00:00.000Z');
  const conversation = createConversation(state, () => 'id-1', () => '2026-01-01T00:00:00.000Z');
  appendMessage(state, conversation.id, 'user', '背景', () => 'm-1', () => '2026-01-01T00:00:01.000Z');
  appendMessage(state, conversation.id, 'assistant', '已记住', () => 'm-2', () => '2026-01-01T00:00:02.000Z');
  appendMessage(state, conversation.id, 'user', '继续', () => 'm-3', () => '2026-01-01T00:00:03.000Z');
  assert.deepEqual(buildChatPayload(state.conversations[0], 'high'), {
    messages: [
      { role: 'user', content: '背景' },
      { role: 'assistant', content: '已记住' },
      { role: 'user', content: '继续' },
    ],
    reasoningEffort: 'high',
  });
});

test('serializes a validated state for manual backup', () => {
  const state = emptyState(() => '2026-01-01T00:00:00.000Z');
  assert.equal(JSON.parse(serializeState(state)).version, 1);
});

test('preserves all saved conversations after the hundredth chat', () => {
  const state = emptyState();
  for (let index = 0; index < 101; index += 1) {
    const conversation = createConversation(state, () => `chat-${index}`);
    appendMessage(state, conversation.id, 'user', `saved message ${index}`);
  }
  const restored = loadState(serializeState(state));
  assert.equal(restored.conversations.length, 101);
  assert.equal(restored.selectedId, 'chat-100');
  assert.equal(restored.conversations.at(-1).messages[0].content, 'saved message 0');
});
