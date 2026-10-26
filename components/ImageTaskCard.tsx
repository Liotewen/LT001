'use client';

import { AlertCircle, Check, LoaderCircle, RefreshCw } from 'lucide-react';
import type { ImageTask } from '@/lib/repositories';

export function ImageTaskCard({ task, onRetry }: { task: ImageTask; onRetry?: (task: ImageTask) => void }) {
  const failed = task.status === 'error';
  const complete = task.status === 'complete';
  return (
    <div className={`image-task ${failed ? 'image-task-error' : ''}`}>
      <div className={`task-status-icon ${complete ? 'task-complete' : failed ? 'task-failed' : ''}`}>
        {complete ? <Check size={16} /> : failed ? <AlertCircle size={16} /> : <LoaderCircle size={16} className="spin" />}
      </div>
      <div className="task-copy"><strong>{failed ? '图片生成失败' : complete ? '图片已生成' : '正在生成图片'}</strong><span>{task.prompt}</span>{failed && <small>{task.error || '请稍后重试'}</small>}</div>
      {failed && onRetry && <button className="small-icon-button" title="重新生成" aria-label="重新生成" onClick={() => onRetry(task)}><RefreshCw size={15} /></button>}
    </div>
  );
}
