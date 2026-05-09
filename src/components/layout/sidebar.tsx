import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ClipboardList,
  LayoutGrid,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '../ui/theme-toggle'
import { useAuth } from '@/hooks/useAuth'
import { useSearch } from '@/hooks/useSearch'

interface NavItem {
  label: string
  icon: ReactNode
  to: string
}

const dashboards: NavItem[] = [
  { label: 'Proyectos', icon: <LayoutGrid className="w-4 h-4" />, to: '/dashboard/proyectos' },
  { label: 'Brand Partners', icon: <Users className="w-4 h-4" />, to: '/dashboard/brand-partners' },
]

const management: NavItem[] = [
  { label: 'Asignaciones', icon: <ClipboardList className="w-4 h-4" />, to: '/gestión/asignaciones' },
]

const admin: NavItem[] = [
  { label: 'Administración', icon: <Shield className="w-4 h-4" />, to: '/admin/usuarios' },
]

export interface SidebarProps {
  /** When true, only icons are shown and the rail collapses to ~48px. */
  collapsed: boolean
  onToggleCollapsed: () => void
}

export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const { isAdmin } = useAuth()
  return (
    // h-screen + sticky pin the sidebar to the viewport so the footer
    // (theme toggle + account) is always visible regardless of how much
    // the main content scrolls. The nav section above scrolls internally
    // when the items don't fit (long lists, small viewports).
    <aside
      role="navigation"
      aria-label="Navegación principal"
      className="sticky top-0 h-screen bg-surface border-r border-border flex flex-col overflow-hidden"
    >
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3 flex flex-col gap-1">
        <Header collapsed={collapsed} onToggle={onToggleCollapsed} />
        <NavSection label="Dashboards" items={dashboards} collapsed={collapsed} />
        <NavSection label="Gestión" items={management} collapsed={collapsed} />
        {isAdmin && (
          <NavSection label="Admin" items={admin} collapsed={collapsed} />
        )}
      </div>

      <div
        className={cn(
          'shrink-0 border-t border-border bg-surface flex flex-col gap-1',
          collapsed ? 'px-1.5 py-2' : 'px-3 py-3'
        )}
      >
        <ThemeToggle compact={collapsed} />
        <UserCard collapsed={collapsed} />
      </div>
    </aside>
  )
}

function Header({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 mb-2 py-1">
        <LogoMark />
        <ToggleButton collapsed onToggle={onToggle} />
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between mb-2 px-2 py-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <LogoMark />
        <span className="font-semibold text-md tracking-snug truncate">
          BP Manager
        </span>
      </div>
      <ToggleButton collapsed={false} onToggle={onToggle} />
    </div>
  )
}

function ToggleButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
      title={collapsed ? 'Expandir' : 'Colapsar'}
      className={cn(
        'grid place-items-center w-7 h-7 rounded-md text-tertiary',
        'hover:text-primary hover:bg-hover transition-colors'
      )}
    >
      {collapsed ? (
        <PanelLeftOpen className="w-4 h-4" />
      ) : (
        <PanelLeftClose className="w-4 h-4" />
      )}
    </button>
  )
}

function LogoMark() {
  return (
    <div
      className="grid place-items-center w-7 h-7 rounded-md text-white font-bold text-sm shadow-glow-accent shrink-0"
      style={{
        background: 'linear-gradient(135deg, var(--accent), #1e40af)',
      }}
      aria-hidden
    >
      B
    </div>
  )
}

function NavSection({
  label,
  items,
  collapsed,
}: {
  label: string
  items: NavItem[]
  collapsed: boolean
}) {
  // Reset the topbar search query on every nav click — covers the
  // "click the same nav item" case where pathname doesn't change so
  // the SearchProvider's useEffect doesn't fire.
  const { setQuery } = useSearch()
  return (
    <div className="mt-3 first:mt-0">
      {!collapsed && (
        <div className="text-2xs font-medium uppercase text-tertiary tracking-widest px-3 pb-1 pt-2">
          {label}
        </div>
      )}
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end
              onClick={() => setQuery('')}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'w-full flex items-center rounded-md text-sm font-medium transition-colors',
                  collapsed
                    ? 'justify-center px-2 py-2'
                    : 'gap-2.5 px-3 py-2',
                  isActive
                    ? 'bg-accent-soft text-accent'
                    : 'text-secondary hover:text-primary hover:bg-hover'
                )
              }
            >
              {item.icon}
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  )
}

function UserCard({ collapsed }: { collapsed: boolean }) {
  const { user, profile, logout } = useAuth()
  if (!user) return null

  const displayName = profile?.nombre ?? user.email ?? 'Usuario'
  const subtitle = profile?.nombre ? user.email ?? '' : ''
  const initial = displayName.charAt(0).toUpperCase() || 'U'

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => void logout()}
        title={`${displayName} · cerrar sesión`}
        aria-label="Cerrar sesión"
        className="grid place-items-center w-9 h-9 mx-auto rounded-full bg-accent-soft text-accent text-2xs font-semibold hover:opacity-80 transition-opacity"
      >
        {initial}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-2 pt-1">
      <div
        aria-hidden
        className="grid place-items-center w-7 h-7 rounded-full bg-accent-soft text-accent text-2xs font-semibold shrink-0"
      >
        {initial}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-medium truncate" title={displayName}>
          {displayName}
        </span>
        {subtitle && (
          <span className="text-2xs text-tertiary truncate" title={subtitle}>
            {subtitle}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          void logout()
        }}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        className="grid place-items-center w-7 h-7 rounded-md text-tertiary hover:text-primary hover:bg-hover transition-colors shrink-0"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
