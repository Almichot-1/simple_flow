const LOCAL_API = 'http://localhost:8080/api'
const PROD_API = 'https://simple-flow.onrender.com/api'

function resolveApiBase() {
  const configured = String(import.meta.env.VITE_API_URL || '').trim()
  const isDeployedHost = typeof window !== 'undefined' && !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
  const configuredIsLocal = /localhost|127\.0\.0\.1/i.test(configured)

  if (configured) {
    if (isDeployedHost && configuredIsLocal) {
      return PROD_API
    }
    return configured
  }

  return import.meta.env.PROD ? PROD_API : LOCAL_API
}

const API_BASE = resolveApiBase()

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
