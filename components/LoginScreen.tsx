'use client';

import { ArrowRight, KeyRound, LockKeyhole } from 'lucide-react';
import { FormEvent, useState } from 'react';

export function LoginScreen({
  onLogin,
  busy,
  error,
}: {
  onLogin: (username: string, password: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onLogin(username, password);
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand"><span>LT</span><strong>AI Workspace</strong></div>
        <div className="login-heading">
          <p className="eyebrow">PRIVATE WORKSPACE</p>
          <h1 id="login-title">欢迎回来</h1>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label>
            <span>账号</span>
            <span className="field-shell"><KeyRound size={17} aria-hidden="true" /><input autoComplete="username" aria-label="账号" value={username} onChange={(event) => setUsername(event.target.value)} required /></span>
          </label>
          <label>
            <span>密码</span>
            <span className="field-shell"><LockKeyhole size={17} aria-hidden="true" /><input type="password" autoComplete="current-password" aria-label="密码" value={password} onChange={(event) => setPassword(event.target.value)} required /></span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button login-submit" type="submit" disabled={busy}>
            <span>{busy ? '正在登录…' : '登录工作区'}</span><ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>
        <div className="login-foot"><span className="status-dot" />私有空间 · 安全连接</div>
      </section>
      <div className="login-side-note"><span>01</span><span>对话、项目与创作<br />在一个连续的工作空间里</span></div>
    </main>
  );
}
