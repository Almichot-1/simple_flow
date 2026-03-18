import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import LoginPage from '../features/auth/pages/LoginPage'
import RegisterPage from '../features/auth/pages/RegisterPage'
import ForgotPasswordPage from '../features/auth/pages/ForgotPasswordPage'
import DashboardPage from '../features/dashboard/pages/DashboardPage'
import PublicMaidRedirectPage from '../features/browse/pages/PublicMaidRedirectPage'
import ProtectedRoute from '../shared/routing/ProtectedRoute'
import PublicOnlyRoute from '../shared/routing/PublicOnlyRoute'
import { useAuth } from '../features/auth/context/useAuth'
import { getDashboardPathForRole } from '../shared/routing/dashboardPath'

function DashboardRootRedirect() {
  const { user } = useAuth()
  return <Navigate to={getDashboardPathForRole(user?.role)} replace />
}

function LegacyDashboardMaidRedirect() {
  const { maidId } = useParams()
  return <Navigate to={`/dashboard/browse/maids/${maidId}`} replace />
}

export default function AppRouter() {
  const { isAuthenticated, user } = useAuth()
  const authenticatedHome = getDashboardPathForRole(user?.role)

  return (
    <Routes>
      <Route path="/" element={<Navigate to={isAuthenticated ? authenticatedHome : '/login'} replace />} />
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
      <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />

      <Route path="/dashboard" element={<ProtectedRoute><DashboardRootRedirect /></ProtectedRoute>} />
      <Route
        path="/dashboard/browse"
        element={<ProtectedRoute allowedRoles={['EMPLOYER', 'ADMIN']}><DashboardPage section="browse" /></ProtectedRoute>}
      />
      <Route
        path="/dashboard/browse/maids/:maidId"
        element={<ProtectedRoute allowedRoles={['EMPLOYER', 'ADMIN']}><DashboardPage section="browse" /></ProtectedRoute>}
      />
      <Route
        path="/dashboard/agency"
        element={<ProtectedRoute allowedRoles={['AGENCY']}><DashboardPage section="agency" /></ProtectedRoute>}
      />
      <Route
        path="/dashboard/admin"
        element={<ProtectedRoute allowedRoles={['ADMIN']}><DashboardPage section="admin" /></ProtectedRoute>}
      />
      <Route
        path="/dashboard/maids/:maidId"
        element={<ProtectedRoute allowedRoles={['EMPLOYER', 'ADMIN']}><LegacyDashboardMaidRedirect /></ProtectedRoute>}
      />

      <Route path="/maids/:maidId" element={<PublicMaidRedirectPage />} />
      <Route path="*" element={<Navigate to={isAuthenticated ? authenticatedHome : '/login'} replace />} />
    </Routes>
  )
}
