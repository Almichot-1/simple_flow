import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/context/useAuth'
import { getDashboardPathForRole } from './dashboardPath'

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const location = useLocation()
  const { isAuthenticated, user } = useAuth()

  if (!isAuthenticated) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to="/login" replace state={{ from }} />
  }

  if (allowedRoles.length > 0) {
    const role = String(user?.role || '').toUpperCase()
    const allowed = allowedRoles.map((entry) => String(entry || '').toUpperCase())
    if (!allowed.includes(role)) {
      return <Navigate to={getDashboardPathForRole(role)} replace />
    }
  }

  return children
}
