import { useEffect, useState, type ReactNode } from 'react'
import { Sidebar } from './sidebar'
import { Topbar, type BreadcrumbItem } from './topbar'
import { cn } from '@/lib/utils'

export interface AppLayoutProps {
  children: ReactNode
  breadcrumb?: BreadcrumbItem[]
  /** Slot rendered inside the topbar, between search and notifications. */
  topbarActions?: ReactNode
}

const STORAGE_KEY = 'bp-sidebar-collapsed'

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppLayout({
  children,
  breadcrumb,
  topbarActions,
}: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed())

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [collapsed])

  return (
    // Flex (not grid) so the sidebar can animate its own width without the
    // grid track having to interpolate. Main content fills the rest.
    <div className="flex min-h-screen">
      <div
        className={cn(
          'shrink-0 transition-[width] duration-150 ease-out',
          collapsed ? 'w-12' : 'w-60'
        )}
      >
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
        />
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <Topbar breadcrumb={breadcrumb} actions={topbarActions} />
        <main className="flex-1 min-w-0">
          <div className="w-full p-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
