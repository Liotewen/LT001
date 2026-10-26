'use client';

import { AlertTriangle, Check, X } from 'lucide-react';
import { FormEvent, useState } from 'react';

export type DialogConfig = {
  title: string;
  description: string;
  inputLabel?: string;
  value?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (value: string) => Promise<void>;
};

export function ActionDialog({ dialog, onClose }: { dialog: DialogConfig; onClose: () => void }) {
  const [value, setValue] = useState(dialog.value || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await dialog.onConfirm(value);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-layer">
      <button className="drawer-scrim" aria-label="关闭对话框" onClick={onClose} />
      <section className="action-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className={`dialog-icon ${dialog.danger ? 'dialog-icon-danger' : ''}`}>{dialog.danger ? <AlertTriangle size={19} /> : <Check size={19} />}</div>
        <button className="icon-button dialog-close" aria-label="关闭对话框" title="关闭对话框" onClick={onClose}><X size={18} /></button>
        <h2 id="dialog-title">{dialog.title}</h2>
        <p>{dialog.description}</p>
        <form onSubmit={submit}>
          {dialog.inputLabel && <label className="dialog-field"><span>{dialog.inputLabel}</span><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} required maxLength={120} /></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className={`primary-button ${dialog.danger ? 'danger-button' : ''}`} type="submit" disabled={busy}>{busy ? '请稍候…' : dialog.confirmLabel}</button></div>
        </form>
      </section>
    </div>
  );
}
