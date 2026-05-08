import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader } from '@/components/layout/page-header'
import { AllowedEmailsManager } from '@/components/Admin/AllowedEmailsManager'

export function AdminPage() {
  return (
    <AppLayout
      breadcrumb={[
        { label: 'Admin' },
        { label: 'Usuarios autorizados', active: true },
      ]}
    >
      <PageHeader
        title="Usuarios autorizados"
        subtitle="Controla qué cuentas de Google pueden acceder a la app."
      />
      <AllowedEmailsManager />
    </AppLayout>
  )
}
