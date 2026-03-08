import { useMemo, useState } from 'react'
import { apiRequest } from '../../../shared/api/client'
import { clearAuth, getStoredToken, getStoredUser, storeAuth } from '../../../shared/lib/storage'
import { AuthContext } from './authContextStore'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken())
  const [user, setUser] = useState(() => getStoredUser())

  async function login(credentials) {
    const data = await apiRequest('/login', { method: 'POST', body: credentials })
    setToken(data.access_token)
    setUser(data.user)
    storeAuth(data.access_token, data.user)
    return data
  }

  function logout() {
    setToken('')
    setUser(null)
    clearAuth()
  }

  const value = useMemo(() => ({
    token,
    user,
    isAuthenticated: Boolean(token),
    login,
    logout,
  }), [token, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
