// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginScreen } from '@/components/LoginScreen';
import { Sidebar } from '@/components/Sidebar';
import { Composer } from '@/components/Composer';

describe('workspace interactions', () => {
  it('submits the login form with entered credentials', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<LoginScreen onLogin={onLogin} busy={false} error={null} />);
    await user.type(screen.getByLabelText('账号'), 'owner');
    await user.type(screen.getByLabelText('密码'), 'secret');
    await user.click(screen.getByRole('button', { name: '登录工作区' }));
    expect(onLogin).toHaveBeenCalledWith('owner', 'secret');
  });

  it('closes the mobile navigation drawer from its close control', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Sidebar
      open onClose={onClose} projects={[]} conversations={[]} selectedId={null} selectedProjectId={null}
      archivedView={false} username="owner" onSelect={vi.fn()} onProjectSelect={vi.fn()}
      onNewConversation={vi.fn()} onNewProject={vi.fn()} onToggleArchived={vi.fn()}
      onRenameConversation={vi.fn()} onArchiveConversation={vi.fn()} onDeleteConversation={vi.fn()}
      onArchiveProject={vi.fn()} onDeleteProject={vi.fn()} onLogout={vi.fn()}
    />);
    await user.click(screen.getByRole('button', { name: '关闭导航' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('switches to image mode and submits image options', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer onSend={onSend} busy={false} reasoningEffort="medium" onEffortChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '图片' }));
    await user.type(screen.getByLabelText('描述想生成的画面'), '极简产品海报');
    await user.selectOptions(screen.getByLabelText('图片尺寸'), '1280x720');
    await user.click(screen.getByRole('button', { name: '生成图片' }));
    expect(onSend).toHaveBeenCalledWith({ mode: 'image', prompt: '极简产品海报', size: '1280x720', count: 1 });
  });
});
