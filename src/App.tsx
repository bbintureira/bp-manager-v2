import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { SearchProvider } from '@/contexts/SearchContext'
import { LoginPage } from '@/components/Auth/LoginPage'
import { CodeGate } from '@/components/Auth/CodeGate'
import { Toaster } from '@/components/ui/toaster'
import { DashboardProyectos } from '@/pages/DashboardProyectos'
import { DashboardBrandPartners } from '@/pages/DashboardBrandPartners'
import { AsignacionesPage } from '@/pages/AsignacionesPage'
import { AdminPage } from '@/pages/AdminPage'

const HOME = '/dashboard/proyectos'

// Note: routes are public. AuthProvider stays mounted so login + isAdmin
// + UserCard work for users who do choose to sign in (via /login), but
// nothing is gated. To re-enable gating, wrap the protected routes in
// `<ProtectedRoute>` (still in src/components/) and the admin route in
// `<AdminRoute>`.
//
// CodeGate is a friction-only access prompt that wraps everything — the
// user must enter a shared code before any of the app renders. See the
// component file for security caveats.
function App() {
  return (
    <CodeGate>
      <BrowserRouter>
        <AuthProvider>
          <SearchProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              {/* Dashboards */}
              <Route path="/dashboard" element={<Navigate to={HOME} replace />} />
              <Route path="/dashboard/proyectos" element={<DashboardProyectos />} />
              <Route
                path="/dashboard/brand-partners"
                element={<DashboardBrandPartners />}
              />

              {/* Gestión */}
              <Route path="/gestión/asignaciones" element={<AsignacionesPage />} />

              {/* Admin (NB: writes still gated server-side by RLS) */}
              <Route path="/admin/usuarios" element={<AdminPage />} />

              <Route path="/" element={<Navigate to={HOME} replace />} />
              <Route path="*" element={<Navigate to={HOME} replace />} />
            </Routes>
          </SearchProvider>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </CodeGate>
  )
}

export default App
