'use client';

import { ArrowUp, Image, LoaderCircle, MessageSquare, Square, Sparkles } from 'lucide-react';
import { FormEvent, KeyboardEvent, useState } from 'react';
import { IMAGE_SIZES, type ImageSize } from '@/lib/constants';
import type { ReasoningEffort } from '@/lib/validation';

export type ComposerPayload =
  | { mode: 'chat'; content: string; reasoningEffort: ReasoningEffort }
  | { mode: 'image'; prompt: string; size: ImageSize; count: number };

export function Composer({
  onSend,
  busy,
  reasoningEffort,
  onEffortChange,
  onStop,
}: {
  onSend: (payload: ComposerPayload) => Promise<void>;
  busy: boolean;
  reasoningEffort: ReasoningEffort;
  onEffortChange: (effort: ReasoningEffort) => void;
  onStop?: () => void;
}) {
  const [mode, setMode] = useState<'chat' | 'image'>('chat');
  const [value, setValue] = useState('');
  const [size, setSize] = useState<ImageSize>('1024x1024');
  const [count, setCount] = useState(1);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const content = value.trim();
    if (!content || busy) return;
    const payload: ComposerPayload = mode === 'chat'
      ? { mode: 'chat', content, reasoningEffort }
      : { mode: 'image', prompt: content, size, count };
    await onSend(payload);
    setValue('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div className="composer-wrap">
      <div className="composer-panel">
        <div className="composer-topline">
          <div className="mode-switch" role="group" aria-label="创作模式">
            <button className={mode === 'chat' ? 'mode-active' : ''} aria-pressed={mode === 'chat'} onClick={() => setMode('chat')}>
              <MessageSquare size={15} />对话
            </button>
            <button className={mode === 'image' ? 'mode-active' : ''} aria-pressed={mode === 'image'} onClick={() => setMode('image')}>
              <Image size={15} />图片
            </button>
          </div>
          {mode === 'chat' ? (
            <div className="effort-control" role="group" aria-label="思考深度">
              <Sparkles size={14} aria-hidden="true" />
              {(['low', 'medium', 'high'] as const).map((effort, index) => (
                <button key={effort} className={reasoningEffort === effort ? 'effort-active' : ''} aria-pressed={reasoningEffort === effort} onClick={() => onEffortChange(effort)}>
                  {['轻度', '标准', '深度'][index]}
                </button>
              ))}
            </div>
          ) : (
            <div className="image-options">
              <label><span>尺寸</span><select aria-label="图片尺寸" value={size} onChange={(event) => setSize(event.target.value as ImageSize)}>
                {IMAGE_SIZES.map((option, index) => <option key={option} value={option}>{['方图', '横图', '竖图'][index]}</option>)}
              </select></label>
              <label><span>张数</span><select aria-label="图片数量" value={count} onChange={(event) => setCount(Number(event.target.value))}>
                {[1, 2, 3, 4].map((amount) => <option key={amount} value={amount}>{amount} 张</option>)}
              </select></label>
            </div>
          )}
        </div>
        <form onSubmit={submit}>
          <textarea
            aria-label={mode === 'chat' ? '输入消息' : '描述想生成的画面'}
            placeholder={mode === 'chat' ? '向 LT 提问…' : '描述想生成的画面…'}
            rows={2}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="composer-bottomline">
            <span className="composer-hint">{mode === 'chat' ? 'Enter 发送 · Shift + Enter 换行' : '图片由 GPT Image 2.5 生成'}</span>
            {busy ? (
              <button className="send-button stop-button" type="button" aria-label="停止生成" title="停止生成" onClick={onStop}><Square size={15} fill="currentColor" /></button>
            ) : (
              <button className="send-button" type="submit" aria-label={mode === 'chat' ? '发送消息' : '生成图片'} title={mode === 'chat' ? '发送消息' : '生成图片'} disabled={!value.trim()}>
                {mode === 'chat' ? <ArrowUp size={19} /> : <><Sparkles size={16} /><span className="send-label">生成图片</span></>}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
