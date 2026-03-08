const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:8080/api')

export const apiBase = API_BASE
export const apiOrigin = API_BASE.replace(/\/api\/?$/, '')

export async function apiRequest(path, { method = 'GET', token, body, headers } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 401 && token) {
      throw new Error('Session expired. Please login again.')
    }
    throw new Error(payload.error || 'Request failed')
  }

  return payload
}
