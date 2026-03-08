import { Navigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/context/useAuth'

export default function PublicOnlyRoute({ children }) {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}
