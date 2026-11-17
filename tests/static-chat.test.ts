// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S8AAAAASUVORK5CYII=';
const fetchMock = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem('lt-chat-session', 'fake-test-session');
  document.body.innerHTML = '<div id="app"></div>';
  vi.stubGlobal('LT_CONFIG', { workerUrl: 'https://api.example' });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => url.endsWith('/api/auth/me')
    ? new Response(JSON.stringify({ username: 'owner' }))
    : new Response('event: delta\ndata: {"content":"已看到图片"}\n\nevent: done\ndata: {}\n\n'));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 640, height: 240, close: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '#fff',
  }) as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob([Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0))], { type: 'image/png' }));
  });
  await import('../site/app.js');
  await waitFor(() => expect(document.querySelector('#chat-form')).not.toBeNull());
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function selectPhoto() {
  const input = document.querySelector<HTMLInputElement>('#image-file');
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { files: [new File(['photo'], '手机截图.png', { type: 'image/png' })] } });
}

describe('static mobile image chat', () => {
  it('offers a photo picker with image previews that can be removed', async () => {
    expect(screen.getByRole('button', { name: '上传图片' })).toBeTruthy();
    selectPhoto();
    await waitFor(() => expect(screen.queryByRole('button', { name: '移除图片 1' })).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '移除图片 1' }));
    expect(document.querySelector('#image-previews img')).toBeNull();
  });

  it('sends a photo without text and retains it for the next question and backup', async () => {
    selectPhoto();
    await waitFor(() => expect(screen.queryByRole('button', { name: '移除图片 1' })).not.toBeNull());
    fireEvent.submit(document.querySelector('#chat-form')!);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/api/chat'))).toBe(true));
    const first = fetchMock.mock.calls.find(([url]) => url.endsWith('/api/chat'))!;
    const firstBody = JSON.parse(first[1].body);
    expect(firstBody.messages[0].content[0].type).toBe('text');
    expect(firstBody.messages[0].content[1]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${pngBase64}`, detail: 'auto' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '发送' }).hasAttribute('disabled')).toBe(false));
    expect(document.querySelector('#image-previews img')).toBeNull();
    expect(document.querySelector('.message-images img')).not.toBeNull();
    fireEvent.input(document.querySelector('#prompt')!, { target: { value: '继续分析刚才的图片' } });
    fireEvent.submit(document.querySelector('#chat-form')!);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/api/chat'))).toHaveLength(2));
    const next = fetchMock.mock.calls.filter(([url]) => url.endsWith('/api/chat'))[1];
    expect(JSON.parse(next[1].body).messages[0]).toEqual(firstBody.messages[0]);
    expect(JSON.parse(localStorage.getItem('lt-chat-state-v1')!).conversations[0].messages[0].images[0].dataUrl).toBe(`data:image/png;base64,${pngBase64}`);
  });

  it('keeps image drafts with their conversation when switching chats', async () => {
    selectPhoto();
    await waitFor(() => expect(screen.queryByRole('button', { name: '移除图片 1' })).not.toBeNull());
    const originalId = JSON.parse(localStorage.getItem('lt-chat-state-v1')!).selectedId;
    fireEvent.click(document.querySelector('#new-chat')!);
    expect(document.querySelector('#image-previews img')).toBeNull();
    fireEvent.click(document.querySelector(`[data-conversation="${originalId}"]`)!);
    expect(document.querySelector('#image-previews img')).not.toBeNull();
  });

  it('rejects unsupported files without sending them to the model', async () => {
    fireEvent.change(document.querySelector('#image-file')!, {
      target: { files: [new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' })] },
    });
    await waitFor(() => expect(document.querySelector('.notice')?.textContent).toContain('请选择'));
    expect(document.querySelector('#image-previews img')).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/api/chat'))).toBe(false);
  });

  it('warns about full storage and preserves the previously saved history', async () => {
    const saved = localStorage.getItem('lt-chat-state-v1');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    selectPhoto();
    await waitFor(() => expect(screen.queryByRole('button', { name: '移除图片 1' })).not.toBeNull());
    fireEvent.submit(document.querySelector('#chat-form')!);
    await waitFor(() => expect(document.querySelector('.notice')?.textContent).toContain('导出备份'));
    expect(localStorage.getItem('lt-chat-state-v1')).toBe(saved);
    expect(document.querySelector('.message-images img')).not.toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: '发送' }).hasAttribute('disabled')).toBe(false));
  });

  it('cancels a pending image selection when a backup replaces local state', async () => {
    let finishDecode!: (value: { width: number; height: number; close: () => void }) => void;
    vi.mocked(createImageBitmap).mockReturnValueOnce(new Promise((resolve) => { finishDecode = resolve as typeof finishDecode; }));
    const saved = localStorage.getItem('lt-chat-state-v1');
    selectPhoto();
    fireEvent.change(document.querySelector('#import-file')!, { target: { files: [{ text: async () => saved }] } });
    await waitFor(() => expect(document.querySelector('.notice')?.textContent).toContain('备份已导入'));
    finishDecode({ width: 640, height: 240, close: vi.fn() });
    await waitFor(() => expect(screen.getByRole('button', { name: '上传图片' }).hasAttribute('disabled')).toBe(false));
    expect(document.querySelector('#image-previews img')).toBeNull();
  });

  it('blocks sending and photo selection while a large backup is still being read', async () => {
    const saved = localStorage.getItem('lt-chat-state-v1');
    let finishRead!: (value: string | null) => void;
    const pendingFile = { text: () => new Promise((resolve) => { finishRead = resolve; }) };
    fireEvent.change(document.querySelector('#import-file')!, { target: { files: [pendingFile] } });
    try {
      expect(screen.getByRole('button', { name: '发送' }).hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: '上传图片' }).hasAttribute('disabled')).toBe(true);
      fireEvent.input(document.querySelector('#prompt')!, { target: { value: '导入过程中不能覆盖新消息' } });
      fireEvent.submit(document.querySelector('#chat-form')!);
      expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/api/chat'))).toBe(false);
    } finally {
      finishRead(saved);
      await waitFor(() => expect(document.querySelector('.notice')?.textContent).toContain('备份已导入'));
    }
  });
});
