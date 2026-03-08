import { Navigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/context/useAuth'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return children
}
