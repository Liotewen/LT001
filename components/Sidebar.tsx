'use client';

import { Archive, FolderKanban, MessageSquare, MoreHorizontal, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { ConversationView } from '@/lib/ui-types';
import type { Project } from '@/lib/repositories';

type Props = {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  conversations: ConversationView[];
  selectedId: string | null;
  selectedProjectId: string | null;
  archivedView: boolean;
  username: string;
  onSelect: (id: string) => void;
  onProjectSelect: (id: string | null) => void;
  onNewConversation: () => void;
  onNewProject: () => void;
  onToggleArchived: () => void;
  onRenameConversation: (conversation: ConversationView) => void;
  onArchiveConversation: (conversation: ConversationView) => void;
  onDeleteConversation: (conversation: ConversationView) => void;
  onArchiveProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onLogout: () => void;
};

export function Sidebar(props: Props) {
  const {
    open, onClose, projects, conversations, selectedId, selectedProjectId, archivedView,
    username, onSelect, onProjectSelect, onNewConversation, onNewProject, onToggleArchived,
    onRenameConversation, onArchiveConversation, onDeleteConversation, onArchiveProject,
    onDeleteProject, onLogout,
  } = props;

  return (
    <>
      {open && <button className="drawer-scrim sidebar-scrim" aria-label="关闭导航面板" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`} aria-label="会话导航">
        <div className="sidebar-topline">
          <div className="brand-lockup"><span className="brand-mark">LT</span><span>工作空间</span></div>
          <button className="icon-button sidebar-close" aria-label="关闭导航" title="关闭导航" onClick={onClose}><X size={18} /></button>
        </div>
        <button className="new-chat-button" onClick={onNewConversation}>
          <Plus size={18} aria-hidden="true" /><span>新建对话</span><kbd>⌘ K</kbd>
        </button>

        <div className="sidebar-scroll">
          <section className="nav-section">
            <div className="section-heading"><span>项目</span><button className="small-icon-button" aria-label="新建项目" title="新建项目" onClick={onNewProject}><Plus size={16} /></button></div>
            <button className={`nav-row all-projects ${selectedProjectId === null ? 'selected' : ''}`} onClick={() => onProjectSelect(null)}>
              <FolderKanban size={16} aria-hidden="true" /><span>全部对话</span><span className="row-count">{conversations.length}</span>
            </button>
            {projects.map((project) => (
              <div className="nav-item-with-menu" key={project.id}>
                <button className={`nav-row ${selectedProjectId === project.id ? 'selected' : ''}`} onClick={() => onProjectSelect(project.id)}>
                  <span className="project-swatch" style={{ backgroundColor: project.color }} /><span className="nav-row-label">{project.name}</span>
                </button>
                <details className="row-menu">
                  <summary aria-label={`${project.name}项目操作`} title="项目操作"><MoreHorizontal size={17} /></summary>
                  <div className="menu-popover">
                    <button onClick={() => onArchiveProject(project)}><Archive size={15} />{archivedView ? '恢复项目' : '归档项目'}</button>
                    <button className="danger-menu-item" onClick={() => onDeleteProject(project)}><Trash2 size={15} />删除项目</button>
                  </div>
                </details>
              </div>
            ))}
          </section>

          <section className="nav-section conversation-section">
            <div className="section-heading"><span>{archivedView ? '已归档' : '最近对话'}</span><span className="section-count">{conversations.length}</span></div>
            {conversations.length === 0 ? (
              <p className="empty-nav">{archivedView ? '暂无归档内容' : '还没有对话'}</p>
            ) : conversations.map((conversation) => (
              <div className="nav-item-with-menu" key={conversation.id}>
                <button className={`nav-row conversation-row ${selectedId === conversation.id ? 'selected' : ''}`} onClick={() => onSelect(conversation.id)}>
                  <MessageSquare size={15} aria-hidden="true" /><span className="nav-row-label">{conversation.title}</span>
                </button>
                <details className="row-menu">
                  <summary aria-label={`${conversation.title}对话操作`} title="对话操作"><MoreHorizontal size={17} /></summary>
                  <div className="menu-popover">
                    {!archivedView && <button onClick={() => onRenameConversation(conversation)}><span className="menu-glyph">Aa</span>重命名</button>}
                    <button onClick={() => onArchiveConversation(conversation)}><Archive size={15} />{archivedView ? '恢复对话' : '归档对话'}</button>
                    <button className="danger-menu-item" onClick={() => onDeleteConversation(conversation)}><Trash2 size={15} />删除对话</button>
                  </div>
                </details>
              </div>
            ))}
          </section>
        </div>

        <div className="sidebar-bottom">
          <button className={`nav-row archive-toggle ${archivedView ? 'selected' : ''}`} onClick={onToggleArchived}>
            {archivedView ? <RotateCcw size={16} /> : <Archive size={16} />}<span>{archivedView ? '返回工作区' : '查看归档'}</span>
          </button>
          <div className="account-row">
            <span className="account-avatar">{username.slice(0, 1).toUpperCase()}</span>
            <span className="account-name" title={username}>{username}</span>
            <button className="small-icon-button" aria-label="退出登录" title="退出登录" onClick={onLogout}><X size={16} /></button>
          </div>
        </div>
      </aside>
    </>
  );
}
