import { Bell, Search } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useSearch } from '@/hooks/useSearch'

export interface BreadcrumbItem {
  label: string
  active?: boolean
}

export interface TopbarProps {
  breadcrumb?: BreadcrumbItem[]
  /** Extra controls rendered between the search box and the icon buttons. */
  actions?: ReactNode
}

export function Topbar({ breadcrumb, actions }: TopbarProps) {
  const { query, setQuery } = useSearch()
  return (
    <header
      className={cn(
        'sticky top-0 z-10 h-16 px-6 gap-4 flex items-center',
        'bg-surface border-b border-border'
      )}
    >
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="text-sm text-secondary">
          {breadcrumb.map((item, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="mx-2 text-tertiary">·</span>}
              {item.active ? (
                <strong className="text-primary font-semibold">
                  {item.label}
                </strong>
              ) : (
                <span>{item.label}</span>
              )}
            </Fragment>
          ))}
        </nav>
      )}

      <div className="flex-1" />

      <label className="flex items-center gap-2 px-2.5 py-1.5 w-[260px] rounded-md border border-border bg-base text-sm text-tertiary cursor-text focus-within:ring-2 focus-within:ring-accent/50 focus-within:border-accent">
        <Search className="w-3.5 h-3.5" />
        <input
          type="search"
          placeholder="Buscar proyecto, BP…"
          aria-label="Buscar"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-tertiary text-primary"
        />
        {query.length === 0 && (
          <kbd className="ml-auto font-mono text-2xs px-1.5 py-px rounded border border-border bg-surface text-tertiary">
            ⌘K
          </kbd>
        )}
      </label>

      {actions}

      <button
        type="button"
        aria-label="Notificaciones"
        className="grid place-items-center w-8 h-8 rounded-md border border-border bg-transparent text-secondary hover:bg-hover hover:text-primary transition-colors"
      >
        <Bell className="w-3.5 h-3.5" />
      </button>
    </header>
  )
}
