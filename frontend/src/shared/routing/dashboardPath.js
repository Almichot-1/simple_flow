export function getDashboardPathForRole(role) {
  const value = String(role || '').toUpperCase()
  if (value === 'AGENCY') return '/dashboard/agency'
  if (value === 'ADMIN') return '/dashboard/admin'
  return '/dashboard/browse'
}

export function resolveSafeRedirectPath(candidate, fallbackRole) {
  const fallback = getDashboardPathForRole(fallbackRole)
  const value = String(candidate || '').trim()
  if (!value.startsWith('/')) return fallback
  return value
}
