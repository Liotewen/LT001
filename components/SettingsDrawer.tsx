'use client';

import { Cpu, Image, Layers3, Sparkles, X } from 'lucide-react';
import type { ReasoningEffort } from '@/lib/validation';

export function SettingsDrawer({
  open,
  onClose,
  reasoningEffort,
  onEffortChange,
  messageCount,
  projectName,
}: {
  open: boolean;
  onClose: () => void;
  reasoningEffort: ReasoningEffort;
  onEffortChange: (effort: ReasoningEffort) => void;
  messageCount: number;
  projectName: string;
}) {
  if (!open) return null;
  return (
    <>
      <button className="drawer-scrim settings-scrim" aria-label="关闭设置" onClick={onClose} />
      <aside className="settings-drawer" aria-label="模型与会话设置">
        <div className="drawer-heading"><div><span className="eyebrow">WORKSPACE</span><h2>会话信息</h2></div><button className="icon-button" aria-label="关闭设置" title="关闭设置" onClick={onClose}><X size={18} /></button></div>
        <section className="settings-section">
          <div className="settings-label"><Cpu size={16} /><span>对话模型</span></div><strong className="model-name">gpt-6.1-sol</strong><span className="settings-caption">推理模型</span>
        </section>
        <section className="settings-section">
          <div className="settings-label"><Image size={16} /><span>图片模型</span></div><strong className="model-name">gpt-image-2.5</strong><span className="settings-caption">图片生成</span>
        </section>
        <section className="settings-section">
          <div className="settings-label"><Sparkles size={16} /><span>思考深度</span></div>
          <div className="settings-segmented" role="group" aria-label="设置思考深度">
            {(['low', 'medium', 'high'] as const).map((effort, index) => <button key={effort} className={reasoningEffort === effort ? 'effort-active' : ''} aria-pressed={reasoningEffort === effort} onClick={() => onEffortChange(effort)}>{['轻度', '标准', '深度'][index]}</button>)}
          </div>
        </section>
        <section className="settings-section context-summary">
          <div className="settings-label"><Layers3 size={16} /><span>当前上下文</span></div>
          <dl><div><dt>所属项目</dt><dd>{projectName || '未分类'}</dd></div><div><dt>历史消息</dt><dd>{messageCount}</dd></div></dl>
        </section>
      </aside>
    </>
  );
}
