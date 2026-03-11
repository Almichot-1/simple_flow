import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from '../features/auth/pages/LoginPage'
import RegisterPage from '../features/auth/pages/RegisterPage'
import DashboardPage from '../features/dashboard/pages/DashboardPage'
import PublicMaidRedirectPage from '../features/browse/pages/PublicMaidRedirectPage'
import ProtectedRoute from '../shared/routing/ProtectedRoute'
import PublicOnlyRoute from '../shared/routing/PublicOnlyRoute'
import { useAuth } from '../features/auth/context/useAuth'

export default function AppRouter() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/dashboard/maids/:maidId" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/maids/:maidId" element={<PublicMaidRedirectPage />} />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
    </Routes>
  )
}
