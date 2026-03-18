import { Navigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/context/useAuth'
import { getDashboardPathForRole } from './dashboardPath'

export default function PublicOnlyRoute({ children }) {
  const { isAuthenticated, user } = useAuth()
  if (isAuthenticated) {
    return <Navigate to={getDashboardPathForRole(user?.role)} replace />
  }
  return children
}
