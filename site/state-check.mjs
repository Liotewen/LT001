import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendMessage,
  buildChatPayload,
  createConversation,
  emptyState,
  isValidState,
  loadState,
  serializeState,
} from './state.mjs';

const imageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S8AAAAASUVORK5CYII=';

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

test('keeps uploaded images in backups and subsequent chat context', () => {
  const state = emptyState();
  const conversation = createConversation(state, () => 'photo-chat');
  const message = appendMessage(state, conversation.id, 'user', '帮我看这张截图');
  message.images = [{ name: '截图.png', dataUrl: imageUrl }];
  appendMessage(state, conversation.id, 'assistant', '图片已收到');
  appendMessage(state, conversation.id, 'user', '继续分析刚才那张图');
  const restored = loadState(serializeState(state));
  assert.equal(restored.conversations[0].messages[0].images[0].dataUrl, imageUrl);
  assert.deepEqual(buildChatPayload(restored.conversations[0], 'high'), {
    messages: [
      { role: 'user', content: [
        { type: 'text', text: '帮我看这张截图' },
        { type: 'image_url', image_url: { url: imageUrl, detail: 'auto' } },
      ] },
      { role: 'assistant', content: '图片已收到' },
      { role: 'user', content: '继续分析刚才那张图' },
    ],
    reasoningEffort: 'high',
  });
});

test('rejects unsafe or malformed image attachments in imported backups', () => {
  const state = emptyState();
  const conversation = createConversation(state);
  const message = appendMessage(state, conversation.id, 'user', '图片');
  for (const url of ['https://example.com/tracker.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,SGVsbG8=']) {
    message.images = [{ name: 'picture.png', dataUrl: url }];
    assert.equal(isValidState(state), false);
  }
  message.images = Array.from({ length: 5 }, () => ({ name: 'photo.png', dataUrl: imageUrl }));
  assert.equal(isValidState(state), false);
  message.images = [{ name: 'photo.png', dataUrl: imageUrl }];
  assert.equal(isValidState(state), true);
  message.role = 'assistant';
  assert.equal(isValidState(state), false);
});
