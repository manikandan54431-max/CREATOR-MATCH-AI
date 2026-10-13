import type { ReactNode } from 'react'
import { BriefcaseBusiness, ChevronDown, CircleUserRound, Command, Film, Home, Inbox, LayoutGrid, MessageCircle, Moon, Settings2, Sparkles } from 'lucide-react'
import type { Role } from '../data/demo'
import { Button, Divider } from './Primitives'

const roleNames: Record<Role, string> = { client: 'Client view', creator: 'Creator view', admin: 'Admin view' }

export function WorkspaceShell({ role, path, onNavigate, onRoleChange, children }: { role: Role; path: string; onNavigate: (path: string) => void; onRoleChange: (role: Role) => void; children: ReactNode }) {
  const links = role === 'client'
    ? [{ label: 'Overview', path: '/workspace', icon: Home }, { label: 'My requests', path: '/workspace/client', icon: Inbox }, { label: 'Messages', path: '/messages', icon: MessageCircle }]
    : role === 'creator'
      ? [{ label: 'Workbench', path: '/workspace/creator', icon: Home }, { label: 'Assignments', path: '/workspace/creator', icon: Film }, { label: 'Portfolio', path: '/workspace/creator', icon: LayoutGrid }, { label: 'Messages', path: '/messages', icon: MessageCircle }]
      : [{ label: 'Triage', path: '/workspace/admin', icon: Home }, { label: 'Requests', path: '/workspace/admin', icon: Inbox }, { label: 'Creators', path: '/workspace/admin', icon: CircleUserRound }, { label: 'Messages', path: '/messages', icon: MessageCircle }]

  return <div className="app-shell">
    <aside className="side-rail">
      <button className="brand-lockup" onClick={() => onNavigate('/')} aria-label="Back to CreatorMatch AI home"><span className="brand-mark"><i /><i /></span><span>CreatorMatch <b>AI</b></span></button>
      <div className="workspace-switcher"><span className="eyebrow">Demo workspace</span><button onClick={() => onRoleChange(role === 'client' ? 'creator' : role === 'creator' ? 'admin' : 'client')}><span>{roleNames[role]}</span><ChevronDown size={15} /></button></div>
      <nav className="rail-nav" aria-label="Workspace navigation">
        {links.map(({ label, path: target, icon: Icon }) => <button key={label} className={path === target || (label === 'Overview' && path === '/workspace') ? 'active' : ''} onClick={() => onNavigate(target)}><Icon size={17} /><span>{label}</span>{label === 'Messages' && <small>2</small>}</button>)}
      </nav>
      <div className="rail-bottom"><Divider /><button className="rail-action" onClick={() => onNavigate('/workspace')}><Settings2 size={17} /><span>Workspace settings</span></button><button className="rail-action" onClick={() => document.documentElement.classList.toggle('dark-mode')}><Moon size={17} /><span>Toggle dark mode</span></button><div className="account-chip"><span className="avatar avatar-blue">{role === 'creator' ? 'MK' : role === 'admin' ? 'PR' : 'NO'}</span><span><b>{role === 'creator' ? 'Mara Kline' : role === 'admin' ? 'Priya Rao' : 'Northline Objects'}</b><small>{role === 'creator' ? 'Creator' : role === 'admin' ? 'Admin' : 'Client'}</small></span><Command size={15} /></div></div>
    </aside>
    <main className="main-frame"><header className="mobile-topbar"><button className="brand-lockup" onClick={() => onNavigate('/')}><span className="brand-mark"><i /><i /></span><span>CreatorMatch <b>AI</b></span></button><Button tone="quiet" className="mobile-role" onClick={() => onRoleChange(role === 'client' ? 'creator' : role === 'creator' ? 'admin' : 'client')}>{roleNames[role]} <ChevronDown size={14} /></Button></header>{children}</main>
  </div>
}
