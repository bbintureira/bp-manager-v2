import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutGrid,
  Users,
  ClipboardList,
  LogOut,
  Shield,
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

export function Sidebar() {
  const { isAdmin } = useAuth()
  return (
    // h-screen + sticky pin the sidebar to the viewport so the footer
    // (theme toggle + account) is always visible regardless of how much
    // the main content scrolls. The nav section above scrolls internally
    // when the items don't fit (long lists, small viewports).
    <aside
      role="navigation"
      aria-label="Navegación principal"
      className="sticky top-0 h-screen bg-surface border-r border-border flex flex-col"
    >
      {/* Top: logo + nav, scrollable when needed.
          `min-h-0` is required so the flex item can actually shrink and
          let `overflow-y-auto` kick in (default min-height in flex is auto). */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-5 flex flex-col gap-1">
        <Logo />
        <NavSection label="Dashboards" items={dashboards} />
        <NavSection label="Gestión" items={management} />
        {isAdmin && <NavSection label="Admin" items={admin} />}
      </div>

      {/* Bottom: pinned. Has its own bg + border-top so the scroll area
          tucks visually under it. */}
      <div className="shrink-0 border-t border-border bg-surface px-3 py-3 flex flex-col gap-1">
        <ThemeToggle />
        <UserCard />
      </div>
    </aside>
  )
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 mb-3">
      <div
        className="grid place-items-center w-7 h-7 rounded-md text-white font-bold text-sm shadow-glow-accent"
        style={{
          background: 'linear-gradient(135deg, var(--accent), #1e40af)',
        }}
        aria-hidden
      >
        B
      </div>
      <span className="font-semibold text-md tracking-snug">BP Manager</span>
    </div>
  )
}

function NavSection({
  label,
  items,
}: {
  label: string
  items: NavItem[]
}) {
  // Reset the topbar search query on every nav click — covers the
  // "click the same nav item" case where pathname doesn't change so
  // the SearchProvider's useEffect doesn't fire.
  const { setQuery } = useSearch()
  return (
    <div className="mt-3 first:mt-0">
      <div className="text-2xs font-medium uppercase text-tertiary tracking-widest px-3 pb-1 pt-2">
        {label}
      </div>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end
              onClick={() => setQuery('')}
              className={({ isActive }) =>
                cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent-soft text-accent'
                    : 'text-secondary hover:text-primary hover:bg-hover'
                )
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  )
}

function UserCard() {
  const { user, profile, logout } = useAuth()
  if (!user) return null

  const displayName = profile?.nombre ?? user.email ?? 'Usuario'
  const subtitle = profile?.nombre ? user.email ?? '' : ''
  const initial = displayName.charAt(0).toUpperCase() || 'U'

  return (
    <div className="flex items-center gap-2 px-2 pt-1">
      <div
        aria-hidden
        className="grid place-items-center w-7 h-7 rounded-full bg-accent-soft text-accent text-2xs font-semibold"
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
        className="grid place-items-center w-7 h-7 rounded-md text-tertiary hover:text-primary hover:bg-hover transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
