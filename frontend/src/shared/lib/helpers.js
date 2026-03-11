import { apiOrigin } from '../api/client'

export function mediaUrl(path) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${apiOrigin}${path}`
}

export function normalizePhoneToDigits(phone) {
  return String(phone || '').replace(/\D/g, '')
}

export function buildWhatsAppUrlFromPhone(phone, message) {
  const digits = normalizePhoneToDigits(phone)
  if (!digits) return ''
  if (!message) return `https://wa.me/${digits}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

function extractPhoneFromWhatsAppUrl(whatsAppUrl) {
  const raw = String(whatsAppUrl || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    const phoneFromQuery = parsed.searchParams.get('phone')
    if (phoneFromQuery) {
      return normalizePhoneToDigits(phoneFromQuery)
    }
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    const lastPart = pathParts[pathParts.length - 1] || ''
    return normalizePhoneToDigits(lastPart)
  } catch {
    return ''
  }
}

export function buildWhatsAppDirectUrl({ phone, whatsAppUrl, message }) {
  const directFromPhone = buildWhatsAppUrlFromPhone(phone, message)
  if (directFromPhone) return directFromPhone

  const extractedPhone = extractPhoneFromWhatsAppUrl(whatsAppUrl)
  const directFromUrlPhone = buildWhatsAppUrlFromPhone(extractedPhone, message)
  if (directFromUrlPhone) return directFromUrlPhone

  const fallback = String(whatsAppUrl || '').trim()
  if (!fallback) return ''
  if (!message) return fallback

  try {
    const parsed = new URL(fallback)
    parsed.searchParams.set('text', message)
    return parsed.toString()
  } catch {
    return fallback
  }
}

export function buildWhatsAppShareUrl(message) {
  if (!message) return 'https://wa.me/'
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}

export function getMaidProfileLink(maidId) {
  return `${window.location.origin}/maids/${maidId}`
}

export function formatRelativeDate(value) {
  if (!value) return 'Recently updated'
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return 'Recently updated'
  const diffMs = Date.now() - timestamp.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Updated today'
  if (diffDays === 1) return 'Updated yesterday'
  if (diffDays < 30) return `Updated ${diffDays} days ago`
  return `Updated on ${timestamp.toLocaleDateString()}`
}
