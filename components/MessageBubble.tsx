'use client';

import { Check, Copy, Sparkles, UserRound } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '@/lib/repositories';

export function MessageBubble({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1300);
    } catch { /* Clipboard access can be unavailable on insecure origins. */ }
  }

  return (
    <article className={`message-row ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className={`message-avatar ${isUser ? 'avatar-user' : 'avatar-assistant'}`} aria-hidden="true">
        {isUser ? <UserRound size={16} /> : <Sparkles size={16} />}
      </div>
      <div className="message-body">
        <div className="message-meta"><strong>{isUser ? '你' : 'LT'}</strong>{message.status === 'pending' && <span className="message-pending">生成中</span>}{message.status === 'error' && <span className="message-error">未完成</span>}</div>
        <div className="message-content">
          {message.content && <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>}
          {message.image_url && <img className="generated-image" src={message.image_url} alt="AI 生成图片" loading="lazy" />}
        </div>
        {!isUser && message.content && <button className="message-copy" title="复制消息" aria-label="复制消息" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>}
      </div>
    </article>
  );
}
