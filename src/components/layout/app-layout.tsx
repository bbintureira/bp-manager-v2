import { type ReactNode } from 'react'
import { Sidebar } from './sidebar'
import { Topbar, type BreadcrumbItem } from './topbar'

export interface AppLayoutProps {
  children: ReactNode
  breadcrumb?: BreadcrumbItem[]
  /** Slot rendered inside the topbar, between search and notifications. */
  topbarActions?: ReactNode
}

export function AppLayout({
  children,
  breadcrumb,
  topbarActions,
}: AppLayoutProps) {
  return (
    <div className="grid grid-cols-[240px_1fr] min-h-screen">
      <Sidebar />
      <div className="flex flex-col min-w-0">
        <Topbar breadcrumb={breadcrumb} actions={topbarActions} />
        <main className="flex-1 min-w-0">
          <div className="w-full p-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
