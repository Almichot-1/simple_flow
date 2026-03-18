import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../../../shared/api/client'
import { useAuth } from '../../auth/context/useAuth'
import {
  buildWhatsAppDirectUrl,
  formatRelativeDate,
  getMaidProfileLink,
  mediaUrl,
} from '../../../shared/lib/helpers'
import { subscribeToAdminNotifications } from '../../../shared/lib/firebase'
import brandLogo from '../../../assets/simflow-logo.svg'

const EXPERIENCE_OPTIONS = [
  { value: 0, label: '0 years (New)' },
  { value: 1, label: '1 year' },
  { value: 2, label: '2 years' },
  { value: 3, label: '3 years' },
  { value: 4, label: '4 years' },
  { value: 5, label: '5 years' },
  { value: 6, label: '6 years' },
  { value: 7, label: '7 years' },
  { value: 8, label: '8 years' },
  { value: 9, label: '9 years' },
  { value: 10, label: '10+ years' },
]

const AVAILABILITY_OPTIONS = [
  { value: 'AVAILABLE', label: 'AVAILABLE' },
  { value: 'ARRIVED', label: 'ARRIVED' },
  { value: 'NOT_AVAILABLE', label: 'NOT_AVAILABLE' },
  { value: 'BOOKED', label: 'BOOKED' },
]

function isOpenAvailabilityStatus(status) {
  const value = String(status || '').toUpperCase()
  return value === 'AVAILABLE' || value === 'ARRIVED'
}

const PAGE_SIZE_BROWSE = 9
const PAGE_SIZE_TABLE = 10

function clampPage(page, totalPages) {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1))
}

function paginateItems(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = clampPage(page, totalPages)
  const start = (safePage - 1) * pageSize
  return {
    pageItems: items.slice(start, start + pageSize),
    totalPages,
    safePage,
  }
}

function compareValues(left, right) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }
  return String(left || '').localeCompare(String(right || ''), undefined, { sensitivity: 'base' })
}

function sortRows(rows, sortConfig) {
  const { key, direction } = sortConfig
  const sorted = [...rows].sort((a, b) => compareValues(a[key], b[key]))
  return direction === 'desc' ? sorted.reverse() : sorted
}

function validateCreateMaidForm(form, photoFile) {
  const errors = {}
  if (!String(form.name || '').trim()) errors.name = 'Name is required.'
  if (Number(form.age) < 18) errors.age = 'Age must be 18 or above.'
  if (!photoFile) errors.photo = 'Profile photo is required.'
  return errors
}

function readStoredList(key) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeStoredList(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore localStorage write failures in private or restricted contexts.
  }
}

async function trackRecentEmployerView(token, maidId) {
  try {
    await apiRequest(`/employer/recent/${maidId}`, { method: 'POST', token })
  } catch {
    // Ignore tracking failures so profile navigation is never blocked.
  }
}

function getMaidCompleteness(maid) {
  const checks = [
    Boolean(String(maid.name || '').trim()),
    Number(maid.age) >= 18,
    Boolean(String(maid.languages || '').trim()),
    Boolean(String(maid.expected_salary || '').trim()),
    Boolean(String(maid.photo_url || '').trim()),
    Boolean(String(maid.intro_video_url || '').trim()),
    isOpenAvailabilityStatus(maid.availability_status),
  ]
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100)
  return Math.max(0, Math.min(100, score))
}

function getMaidMissingFields(maid) {
  const missing = []
  if (!String(maid.expected_salary || '').trim()) missing.push('salary')
  if (!String(maid.languages || '').trim()) missing.push('languages')
  if (!String(maid.photo_url || '').trim()) missing.push('photo')
  if (!String(maid.intro_video_url || '').trim()) missing.push('intro video')
  if (!isOpenAvailabilityStatus(maid.availability_status)) missing.push('availability not open')
  return missing
}

function getAgencyProfileVisibility(maid) {
  const isAvailable = isOpenAvailabilityStatus(maid.availability_status)
  const isComplete = getMaidMissingFields(maid).length === 0

  if (String(maid.availability_status || '').toUpperCase() === 'ARRIVED') {
    return { label: 'Arrived', className: 'status-arrived' }
  }

  if (!isAvailable) {
    return { label: 'Hidden', className: 'status-hidden' }
  }
  if (!isComplete) {
    return { label: 'Incomplete', className: 'status-incomplete' }
  }
  return { label: 'Live', className: 'status-live' }
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12.04 2C6.55 2 2.1 6.45 2.1 11.94c0 1.93.56 3.81 1.61 5.41L2 22l4.8-1.67a9.91 9.91 0 0 0 5.24 1.5h.01c5.49 0 9.94-4.45 9.94-9.94A9.95 9.95 0 0 0 12.04 2Zm0 18.2c-1.57 0-3.1-.42-4.44-1.22l-.32-.19-2.85.99.93-2.77-.2-.34a8.26 8.26 0 0 1-1.28-4.43c0-4.57 3.72-8.29 8.3-8.29a8.3 8.3 0 0 1 8.29 8.29c0 4.58-3.72 8.29-8.3 8.29Zm4.55-6.2c-.25-.12-1.48-.73-1.71-.82-.23-.09-.39-.12-.56.12-.16.25-.64.82-.78.99-.14.16-.28.19-.53.06-.24-.12-1.03-.38-1.95-1.22a7.35 7.35 0 0 1-1.36-1.69c-.14-.24-.02-.37.1-.49.11-.11.24-.29.36-.44.12-.14.16-.24.24-.4.08-.16.04-.31-.02-.43-.06-.12-.56-1.36-.76-1.86-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.24-.85.83-.85 2.02s.87 2.35.99 2.51c.12.17 1.7 2.6 4.11 3.64.57.25 1.02.4 1.37.51.58.18 1.1.16 1.52.1.47-.07 1.48-.61 1.68-1.2.2-.59.2-1.09.14-1.2-.05-.12-.22-.18-.46-.3Z"
      />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M18 16a3 3 0 0 0-2.39 1.2L8.91 13.9a3.2 3.2 0 0 0 0-3.8l6.7-3.3A3 3 0 1 0 15 5a3.2 3.2 0 0 0 .05.56l-6.7 3.3a3 3 0 1 0 0 6.28l6.7 3.3A3 3 0 1 0 18 16Z"
      />
    </svg>
  )
}

function buildMaidDiscussionMessage(maid) {
  return `Hello, I am interested in ${maid.name} profile. Profile link: ${getMaidProfileLink(maid.ID)}`
}

function parseNotificationTimestamp(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') {
    return value.toDate()
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const queryClient = useQueryClient()
  const { token, user, logout } = useAuth()

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [activeView, setActiveView] = useState('browse')

  const [filters, setFilters] = useState({ age_min: '', age_max: '', experience_min: '', lang: '', availability_status: '' })
  const [appliedFilters, setAppliedFilters] = useState({ age_min: '', age_max: '', experience_min: '', lang: '', availability_status: '' })

  const [maidForm, setMaidForm] = useState({
    name: '',
    age: 18,
    experience_years: 1,
    expected_salary: '',
    languages: 'Amharic,Arabic',
    availability_status: 'AVAILABLE',
  })
  const [photoFile, setPhotoFile] = useState(null)
  const [videoFile, setVideoFile] = useState(null)
  const [editPhotoFile, setEditPhotoFile] = useState(null)
  const [editVideoFile, setEditVideoFile] = useState(null)
  const [editingMaidId, setEditingMaidId] = useState(null)
  const [editingMaidPulseId, setEditingMaidPulseId] = useState(null)
  const [showAgencyForm, setShowAgencyForm] = useState(false)
  const [agencyProfileFilter, setAgencyProfileFilter] = useState('all')
  const [selectedAgencyMaidIds, setSelectedAgencyMaidIds] = useState([])
  const [editMaidForm, setEditMaidForm] = useState({
    name: '',
    age: 18,
    experience_years: 0,
    expected_salary: '',
    languages: '',
    narrative: '',
    availability_status: 'AVAILABLE',
  })
  const [adminAgencyId, setAdminAgencyId] = useState('')
  const [adminSubscriptionId, setAdminSubscriptionId] = useState('')
  const [agencyWhatsappPhoneDraft, setAgencyWhatsappPhoneDraft] = useState('')
  const [savedProfiles, setSavedProfiles] = useState([])
  const [recentViews, setRecentViews] = useState([])
  const [contactedAgencies, setContactedAgencies] = useState([])
  const [isApprovingAgency, setIsApprovingAgency] = useState(false)
  const [isActivatingSubscription, setIsActivatingSubscription] = useState(false)
  const [agencyModerationInFlightId, setAgencyModerationInFlightId] = useState(null)
  const [pendingModerationAction, setPendingModerationAction] = useState(null)
  const [pendingVisitorContactAction, setPendingVisitorContactAction] = useState(null)
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState(false)
  const [pendingDeleteMaid, setPendingDeleteMaid] = useState(null)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [isSavingContact, setIsSavingContact] = useState(false)
  const [isCreatingMaid, setIsCreatingMaid] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [browsePage, setBrowsePage] = useState(1)
  const [activatedPage, setActivatedPage] = useState(1)
  const [pendingAgencyPage, setPendingAgencyPage] = useState(1)
  const [subscriptionPage, setSubscriptionPage] = useState(1)
  const [visitsPage, setVisitsPage] = useState(1)
  const [toasts, setToasts] = useState([])
  const [activatedSort, setActivatedSort] = useState({ key: 'agency_id', direction: 'asc' })
  const [pendingSort, setPendingSort] = useState({ key: 'created_at', direction: 'desc' })
  const [subscriptionSort, setSubscriptionSort] = useState({ key: 'ID', direction: 'desc' })
  const [visitsSort, setVisitsSort] = useState({ key: 'visits', direction: 'desc' })
  const [adminNotifications, setAdminNotifications] = useState([])
  const lastQueryErrorRef = useRef('')
  const latestAdminNotificationRef = useRef('')

  const isAgency = user?.role === 'AGENCY'
  const isAdmin = user?.role === 'ADMIN'
  const isEmployer = user?.role === 'EMPLOYER'
  const employerSavedKey = `employer_saved_profiles_${user?.id || 'anon'}`
  const employerContactedKey = `employer_contacted_agencies_${user?.id || 'anon'}`
  const showBrowseView = activeView === 'browse' || isAgency
  const showAgencyView = isAgency

  const routedMaidId = useMemo(() => {
    if (params.maidId && /^\d+$/.test(params.maidId)) {
      return Number(params.maidId)
    }
    const queryMaid = new URLSearchParams(location.search).get('maid')
    return queryMaid && /^\d+$/.test(queryMaid) ? Number(queryMaid) : null
  }, [params.maidId, location.search])

  const filterQuery = useMemo(() => {
    const paramsObj = new URLSearchParams()
    Object.entries(appliedFilters).forEach(([key, value]) => {
      if (String(value).trim()) paramsObj.set(key, value)
    })
    return paramsObj.toString() ? `?${paramsObj.toString()}` : ''
  }, [appliedFilters])

  const browseQuery = useQuery({
    queryKey: ['maids', token, filterQuery],
    queryFn: () => apiRequest(`/maids${filterQuery}`, { token }),
    enabled: Boolean(token),
  })

  const myMaidsQuery = useQuery({
    queryKey: ['agency-maids', token],
    queryFn: () => apiRequest('/agency/maids', { token }),
    enabled: Boolean(token) && isAgency,
  })

  const agencyContactQuery = useQuery({
    queryKey: ['agency-contact', token],
    queryFn: () => apiRequest('/agency/contact', { token }),
    enabled: Boolean(token) && isAgency,
  })

  const subscriptionsQuery = useQuery({
    queryKey: ['admin-subscriptions', token],
    queryFn: () => apiRequest('/admin/subscriptions', { token }),
    enabled: Boolean(token) && isAdmin,
  })

  const pendingAgenciesQuery = useQuery({
    queryKey: ['admin-pending-agencies', token],
    queryFn: () => apiRequest('/admin/agencies/pending', { token }),
    enabled: Boolean(token) && isAdmin,
  })

  const activatedAgenciesQuery = useQuery({
    queryKey: ['admin-activated-agencies', token],
    queryFn: () => apiRequest('/admin/agencies/activated', { token }),
    enabled: Boolean(token) && isAdmin,
  })

  const visitStatsQuery = useQuery({
    queryKey: ['admin-visit-stats', token],
    queryFn: () => apiRequest('/admin/visit-stats', { token }),
    enabled: Boolean(token) && isAdmin,
  })

  const employerSavedQuery = useQuery({
    queryKey: ['employer-saved', token],
    queryFn: () => apiRequest('/employer/saved', { token }),
    enabled: Boolean(token) && isEmployer,
  })

  const employerRecentQuery = useQuery({
    queryKey: ['employer-recent', token],
    queryFn: () => apiRequest('/employer/recent', { token }),
    enabled: Boolean(token) && isEmployer,
  })

  useEffect(() => {
    if (!isEmployer) return
    setContactedAgencies(readStoredList(employerContactedKey))
  }, [isEmployer, employerContactedKey])

  useEffect(() => {
    if (!isEmployer) return
    setSavedProfiles(employerSavedQuery.data || [])
  }, [isEmployer, employerSavedQuery.data])

  useEffect(() => {
    if (!isEmployer) return
    setRecentViews(employerRecentQuery.data || [])
  }, [isEmployer, employerRecentQuery.data])

  useEffect(() => {
    if (!isAdmin) {
      setAdminNotifications([])
      latestAdminNotificationRef.current = ''
      return
    }

    let isMounted = true
    let unsubscribe = () => {}

    ;(async () => {
      unsubscribe = await subscribeToAdminNotifications(
        (rows) => {
          if (!isMounted) return
          setAdminNotifications(rows)

          const newestId = rows[0]?.id || ''
          if (!newestId) return

          if (!latestAdminNotificationRef.current) {
            latestAdminNotificationRef.current = newestId
            return
          }

          if (newestId !== latestAdminNotificationRef.current) {
            latestAdminNotificationRef.current = newestId
            setMessage('New agency registration notification received.')
          }
        },
        (subscribeError) => {
          if (!isMounted) return
          setError(subscribeError?.message || 'Failed to load admin notifications.')
        },
      )
    })()

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [isAdmin])

  const agencyWhatsappPhone = agencyWhatsappPhoneDraft || agencyContactQuery.data?.phone || ''
  const isWhatsappConfigured = normalizeDigits(agencyWhatsappPhone).length > 0

  const isDashboardBusy =
    browseQuery.isFetching ||
    myMaidsQuery.isFetching ||
    agencyContactQuery.isFetching ||
    employerSavedQuery.isFetching ||
    employerRecentQuery.isFetching ||
    subscriptionsQuery.isFetching ||
    pendingAgenciesQuery.isFetching ||
    activatedAgenciesQuery.isFetching ||
    visitStatsQuery.isFetching ||
    isApprovingAgency ||
    isActivatingSubscription ||
    Boolean(agencyModerationInFlightId) ||
    isDeletingAccount ||
    isSavingContact

  const queryError = browseQuery.error || myMaidsQuery.error || agencyContactQuery.error || employerSavedQuery.error || employerRecentQuery.error || subscriptionsQuery.error || pendingAgenciesQuery.error || activatedAgenciesQuery.error || visitStatsQuery.error
  const maidFormErrors = useMemo(() => validateCreateMaidForm(maidForm, photoFile), [maidForm, photoFile])

  useEffect(() => {
    if (queryError?.message === 'Session expired. Please login again.') {
      logout()
      navigate('/login')
    }
  }, [queryError, logout, navigate])

  useEffect(() => {
    if (!message) return
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, type: 'ok', text: message }])
    setMessage('')
    const timeoutId = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 4000)
    return () => window.clearTimeout(timeoutId)
  }, [message])

  useEffect(() => {
    if (!error) return
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, type: 'err', text: error }])
    setError('')
    const timeoutId = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 5000)
    return () => window.clearTimeout(timeoutId)
  }, [error])

  useEffect(() => {
    const queryErrorMessage = queryError?.message
    if (!queryErrorMessage || queryErrorMessage === 'Session expired. Please login again.') return
    if (lastQueryErrorRef.current === queryErrorMessage) return
    lastQueryErrorRef.current = queryErrorMessage
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, type: 'err', text: queryErrorMessage }])
    const timeoutId = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 5000)
    return () => window.clearTimeout(timeoutId)
  }, [queryError])

  useEffect(() => {
    if (!message) return
    const timeoutId = window.setTimeout(() => setMessage(''), 3200)
    return () => window.clearTimeout(timeoutId)
  }, [message])

  useEffect(() => {
    const maids = browseQuery.data || []
    if (!maids.length || routedMaidId === null) return
    const target = document.getElementById(`maid-${routedMaidId}`)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [browseQuery.data, routedMaidId])

  const displayedMaids = useMemo(() => {
    const maids = browseQuery.data || []
    if (routedMaidId === null) return maids
    return maids.filter((maid) => maid.ID === routedMaidId)
  }, [browseQuery.data, routedMaidId])

  const searchedMaids = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase()
    if (!needle) return displayedMaids
    return displayedMaids.filter((maid) => {
      const haystack = [maid.name, maid.languages, maid.narrative, maid.expected_salary, maid.availability_status]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [displayedMaids, searchTerm])

  const browsePageData = useMemo(
    () => paginateItems(searchedMaids, browsePage, PAGE_SIZE_BROWSE),
    [searchedMaids, browsePage],
  )

  useEffect(() => {
    setBrowsePage(1)
  }, [searchTerm, appliedFilters, routedMaidId])

  useEffect(() => {
    setBrowsePage((page) => clampPage(page, browsePageData.totalPages))
  }, [browsePageData.totalPages])

  const agencyMaids = useMemo(() => myMaidsQuery.data || [], [myMaidsQuery.data])
  const editingMaid = useMemo(
    () => agencyMaids.find((maid) => maid.ID === editingMaidId) || null,
    [agencyMaids, editingMaidId],
  )

  const filteredAgencyMaids = useMemo(() => {
    if (agencyProfileFilter === 'incomplete') {
      return agencyMaids.filter((maid) => getMaidMissingFields(maid).length > 0)
    }
    if (agencyProfileFilter === 'missing-photo') {
      return agencyMaids.filter((maid) => !String(maid.photo_url || '').trim())
    }
    if (agencyProfileFilter === 'arrived') {
      return agencyMaids.filter((maid) => String(maid.availability_status || '').toUpperCase() === 'ARRIVED')
    }
    if (agencyProfileFilter === 'hidden') {
      return agencyMaids.filter((maid) => !isOpenAvailabilityStatus(maid.availability_status))
    }
    return agencyMaids
  }, [agencyMaids, agencyProfileFilter])
  const agencyAvgHealth = useMemo(() => {
    if (!agencyMaids.length) return 0
    const total = agencyMaids.reduce((acc, maid) => acc + getMaidCompleteness(maid), 0)
    return Math.round(total / agencyMaids.length)
  }, [agencyMaids])
  const agencyProfilesWithMedia = useMemo(() => agencyMaids.filter((maid) => maid.photo_url).length, [agencyMaids])
  const agencyTopProfiles = useMemo(
    () => [...agencyMaids]
      .map((maid) => ({ ...maid, health: getMaidCompleteness(maid), missing: getMaidMissingFields(maid) }))
      .sort((a, b) => b.health - a.health)
      .slice(0, 4),
    [agencyMaids],
  )
  const agencyMissingCoverage = useMemo(
    () => agencyMaids.filter((maid) => getMaidMissingFields(maid).length > 0).length,
    [agencyMaids],
  )

  useEffect(() => {
    setSelectedAgencyMaidIds((prev) => prev.filter((id) => filteredAgencyMaids.some((maid) => maid.ID === id)))
  }, [filteredAgencyMaids])

  const adminSlaHours = useMemo(() => {
    if (!pendingAgenciesQuery.data?.length) return 0
    const now = Date.now()
    const totalHours = pendingAgenciesQuery.data.reduce((acc, agency) => {
      const createdAt = new Date(agency.created_at || 0).getTime()
      if (!createdAt) return acc
      return acc + (now - createdAt) / (1000 * 60 * 60)
    }, 0)
    return Math.round(totalHours / pendingAgenciesQuery.data.length)
  }, [pendingAgenciesQuery.data])

  const adminSlaBreaches = useMemo(() => {
    if (!pendingAgenciesQuery.data?.length) return 0
    const now = Date.now()
    return pendingAgenciesQuery.data.filter((agency) => {
      const createdAt = new Date(agency.created_at || 0).getTime()
      if (!createdAt) return false
      return (now - createdAt) / (1000 * 60 * 60) > 48
    }).length
  }, [pendingAgenciesQuery.data])

  const subscriptionHealth = useMemo(() => {
    const list = subscriptionsQuery.data || []
    if (!list.length) return { paidRate: 0, failureRate: 0 }
    const paid = list.filter((sub) => String(sub.status || '').toUpperCase() === 'PAID').length
    const failed = list.filter((sub) => String(sub.status || '').toUpperCase() === 'FAILED').length
    return {
      paidRate: Math.round((paid / list.length) * 100),
      failureRate: Math.round((failed / list.length) * 100),
    }
  }, [subscriptionsQuery.data])

  const activityTrend = useMemo(() => {
    const total = Number(visitStatsQuery.data?.total_employer_visits || 0)
    const recent = Number(visitStatsQuery.data?.last_24h_visits || 0)
    if (!total) return 0
    return Math.round((recent / total) * 100)
  }, [visitStatsQuery.data])

  const trustStats = useMemo(() => {
    const maids = browseQuery.data || []
    const verifiedAgencyIds = new Set(
      maids
        .filter((maid) => maid.agency_verified)
        .map((maid) => String(maid.agency_id || maid.AgencyID || maid.agency_phone || maid.ID)),
    )
    const activeCandidates = maids.filter((maid) => isOpenAvailabilityStatus(maid.availability_status)).length
    return {
      verifiedAgencies: verifiedAgencyIds.size,
      activeCandidates,
    }
  }, [browseQuery.data])

  const roleHero = useMemo(() => {
    if (isEmployer) {
      return {
        title: 'Hire confidently from verified domestic worker profiles.',
        subtitle: 'Compare candidates quickly, save your shortlist, and contact trusted agencies in minutes.',
        ctaLabel: 'Browse Profiles',
        ctaAction: () => {
          setActiveView('browse')
          navigate('/dashboard')
          setTimeout(() => {
            document.getElementById('browse-profiles-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 60)
        },
      }
    }

    if (isAgency) {
      return {
        title: 'List stronger candidates and close placements faster.',
        subtitle: 'Publish complete profiles, keep availability fresh, and improve profile performance from one dashboard.',
        ctaLabel: 'List a Candidate',
        ctaAction: () => {
          document.getElementById('agency-create-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        },
      }
    }

    return {
      title: 'Run marketplace operations with speed and confidence.',
      subtitle: 'Approve agencies fast, monitor subscription health, and keep platform quality high every day.',
      ctaLabel: 'Review Approval Queue',
      ctaAction: () => {
        setActiveView('admin')
        setTimeout(() => {
          document.getElementById('admin-approval-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 60)
      },
    }
  }, [isAgency, isEmployer, navigate])

  function persistContactedAgencies(next) {
    setContactedAgencies(next)
    writeStoredList(employerContactedKey, next)
  }

  async function toggleSavedProfile(maid) {
    if (!isEmployer) return
    setError('')

    const exists = savedProfiles.some((entry) => entry.id === maid.ID)
    try {
      if (exists) {
        await apiRequest(`/employer/saved/${maid.ID}`, { method: 'DELETE', token })
      } else {
        await apiRequest(`/employer/saved/${maid.ID}`, { method: 'POST', token })
      }
      await queryClient.invalidateQueries({ queryKey: ['employer-saved', token] })
      setMessage(exists ? 'Profile removed from saved list.' : 'Profile saved to your dashboard.')
    } catch (err) {
      if (err.message === 'Session expired. Please login again.') {
        logout()
        navigate('/login')
        return
      }
      setError(err.message)
    }
  }

  function recordRecentView(maid) {
    if (!isEmployer) return
    trackRecentEmployerView(token, maid.ID).then(() => {
      queryClient.invalidateQueries({ queryKey: ['employer-recent', token] })
    })
  }

  function recordContactedAgency(maid) {
    if (!isEmployer) return
    const agencyRef = String(maid.agency_id || maid.AgencyID || maid.agency_phone || maid.agency_whatsapp || maid.ID)
    const next = [
      {
        agency_ref: agencyRef,
        maid_id: maid.ID,
        maid_name: maid.name,
        phone: maid.agency_phone || maid.agency_whatsapp || '',
        contacted_at: new Date().toISOString(),
      },
      ...contactedAgencies.filter((entry) => entry.agency_ref !== agencyRef),
    ].slice(0, 20)
    persistContactedAgencies(next)
  }

  function requestVisitorContactAction(maid, contactUrl) {
    if (!isEmployer || !contactUrl) return
    setPendingVisitorContactAction({ maid, contactUrl })
  }

  function closeVisitorContactModal() {
    setPendingVisitorContactAction(null)
  }

  useEffect(() => {
    if (!pendingVisitorContactAction) return undefined

    const timer = window.setTimeout(() => {
      setPendingVisitorContactAction(null)
    }, 5000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [pendingVisitorContactAction])

  function confirmVisitorContactAction() {
    if (!pendingVisitorContactAction?.contactUrl) return
    recordContactedAgency(pendingVisitorContactAction.maid)
    window.open(pendingVisitorContactAction.contactUrl, '_blank', 'noopener,noreferrer')
    setPendingVisitorContactAction(null)
    setMessage('Opening agency WhatsApp contact.')
  }

  async function createMaid(event) {
    event.preventDefault()
    if (isCreatingMaid) return

    setMessage('')
    setError('')

    const validationErrors = validateCreateMaidForm(maidForm, photoFile)
    if (Object.keys(validationErrors).length > 0) {
      setError('Please fix the highlighted form fields before submitting.')
      return
    }

    setIsCreatingMaid(true)
    try {
      const formData = new FormData()
      formData.append('name', maidForm.name)
      formData.append('age', String(maidForm.age))
      formData.append('experience_years', String(maidForm.experience_years))
      formData.append('expected_salary', maidForm.expected_salary)
      formData.append('languages', maidForm.languages)
      formData.append('availability_status', maidForm.availability_status)
      if (photoFile) formData.append('photo', photoFile)
      if (videoFile) formData.append('video', videoFile)

      await apiRequest('/agency/maids', { method: 'POST', token, body: formData })
      setMessage('Maid profile created.')
      setPhotoFile(null)
      setVideoFile(null)
      setMaidForm({
        name: '',
        age: 18,
        experience_years: 1,
        expected_salary: '',
        languages: 'Amharic,Arabic',
        availability_status: 'AVAILABLE',
      })
      setShowAgencyForm(false)

      queryClient.invalidateQueries({ queryKey: ['agency-maids', token] })
      queryClient.invalidateQueries({ queryKey: ['maids'] })
    } catch (err) {
      if (err.message === 'Session expired. Please login again.') {
        logout()
        navigate('/login')
        return
      }
      setError(err.message)
    } finally {
      setIsCreatingMaid(false)
    }
  }

  async function deleteMaid(id) {
    setMessage('')
    setError('')
    try {
      await apiRequest(`/agency/maids/${id}`, { method: 'DELETE', token })
      setMessage('Maid profile deleted.')
      queryClient.invalidateQueries({ queryKey: ['agency-maids', token] })
      queryClient.invalidateQueries({ queryKey: ['maids'] })
    } catch (err) {
      if (err.message === 'Session expired. Please login again.') {
        logout()
        navigate('/login')
        return
      }
      setError(err.message)
    }
  }

  async function confirmDeleteMaid() {
    if (!pendingDeleteMaid?.ID) return
    if (pendingDeleteMaid.isBulk) {
      const ids = [...selectedAgencyMaidIds]
      for (const maidID of ids) {
        await deleteMaid(maidID)
      }
      setSelectedAgencyMaidIds([])
    } else {
      await deleteMaid(pendingDeleteMaid.ID)
    }
    setPendingDeleteMaid(null)
  }

  function startEditMaid(maid) {
    setEditingMaidId(maid.ID)
    setEditingMaidPulseId(maid.ID)
    setShowAgencyForm(true)
    setEditPhotoFile(null)
    setEditVideoFile(null)
    setEditMaidForm({
      name: maid.name || '',
      age: Number(maid.age || 18),
      experience_years: Number(maid.experience_years || 0),
      expected_salary: maid.expected_salary || '',
      languages: maid.languages || '',
      narrative: maid.narrative || '',
      availability_status: maid.availability_status || 'AVAILABLE',
    })

    window.setTimeout(() => {
      document.getElementById('agency-create-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)

    window.setTimeout(() => {
      setEditingMaidPulseId(null)
    }, 1600)
  }

  function cancelEditMaid() {
    setEditingMaidId(null)
    setEditingMaidPulseId(null)
    setEditPhotoFile(null)
    setEditVideoFile(null)
  }

  async function updateMaid(id) {
    setMessage('')
    setError('')

    try {
      const formData = new FormData()
      formData.append('name', editMaidForm.name)
      formData.append('age', String(Number(editMaidForm.age)))
      formData.append('experience_years', String(Number(editMaidForm.experience_years)))
      formData.append('expected_salary', editMaidForm.expected_salary)
      formData.append('languages', editMaidForm.languages)
      formData.append('narrative', editMaidForm.narrative)
      formData.append('availability_status', editMaidForm.availability_status)
      if (editPhotoFile) formData.append('photo', editPhotoFile)
      if (editVideoFile) formData.append('video', editVideoFile)

      await apiRequest(`/agency/maids/${id}`, {
        method: 'PUT',
        token,
        body: formData,
      })

      setMessage('Maid profile updated.')
      setEditingMaidId(null)
      setEditPhotoFile(null)
      setEditVideoFile(null)
      setShowAgencyForm(false)
      queryClient.invalidateQueries({ queryKey: ['agency-maids', token] })
      queryClient.invalidateQueries({ queryKey: ['maids'] })
    } catch (err) {
      if (err.message === 'Session expired. Please login again.') {
        logout()
        navigate('/login')
        return
      }
      setError(err.message)
    }
  }

  function focusAgencyProfiles() {
    document.getElementById('agency-profiles-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function applyAgencyFilter(nextFilter) {
    setAgencyProfileFilter(nextFilter)
    focusAgencyProfiles()
  }

  function toggleAgencyMaidSelection(maidId) {
    setSelectedAgencyMaidIds((prev) => (
      prev.includes(maidId) ? prev.filter((id) => id !== maidId) : [...prev, maidId]
    ))
  }

  function toggleSelectAllFilteredAgencyMaids() {
    const allVisibleIds = filteredAgencyMaids.map((maid) => maid.ID)
    const allAlreadySelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedAgencyMaidIds.includes(id))
    if (allAlreadySelected) {
      setSelectedAgencyMaidIds([])
      return
    }
    setSelectedAgencyMaidIds(allVisibleIds)
  }

  async function bulkUpdateAvailability(nextStatus) {
    if (selectedAgencyMaidIds.length === 0) {
      setError('Select at least one profile first.')
      return
    }
    const selectedProfiles = agencyMaids.filter((maid) => selectedAgencyMaidIds.includes(maid.ID))
    try {
      await Promise.all(selectedProfiles.map((maid) => apiRequest(`/agency/maids/${maid.ID}`, {
        method: 'PUT',
        token,
        body: {
          name: maid.name,
          age: Number(maid.age),
          experience_years: Number(maid.experience_years || 0),
          expected_salary: maid.expected_salary || '',
          languages: maid.languages || '',
          narrative: maid.narrative || '',
          availability_status: nextStatus,
          photo_url: maid.photo_url || '',
          intro_video_url: maid.intro_video_url || '',
        },
      })))
      setSelectedAgencyMaidIds([])
      setMessage(`Updated ${selectedProfiles.length} profiles to ${nextStatus}.`)
      queryClient.invalidateQueries({ queryKey: ['agency-maids', token] })
      queryClient.invalidateQueries({ queryKey: ['maids'] })
    } catch (err) {
      if (err.message === 'Session expired. Please login again.') {
        logout()
        navigate('/login')
        return
      }
      setError(err.message)
    }
  }

  async function quickUpdateAvailability(maid, nextStatus) {
    const currentStatus = String(maid.availability_status || '').toUpperCase()
    if (currentStatus === nextStatus) return

    setMessage('')
    setError('')

    try {
      await apiRequest(`/agency/maids/${maid.ID}`, {
        method: 'PUT',
        token,
        body: {
          name: maid.name,
          age: Number(maid.age),
          experience_years: Number(maid.experience_years || 0),
          expected_salary: maid.expected_salary || '',
          languages: maid.languages || '',
          narrative: maid.narrative || '',
          availability_status: nextStatus,
        },
      })

      setMessage(`${maid.name} status updated to ${nextStatus}.`)
      queryClient.invalidateQueries({ queryKey: ['agency-maids', token] })
      queryClient.invalidateQueries({ queryKey: ['maids'] })
    } catch (err) {
      if (err.message === 'Session expired. Please login again.') {
        logout()
        navigate('/login')
        return
      }
      setError(err.message)
    }
  }

  function requestBulkDelete() {
    if (selectedAgencyMaidIds.length === 0) {
      setError('Select at least one profile first.')
      return
    }
    setPendingDeleteMaid({
      ID: selectedAgencyMaidIds[0],
      name: `${selectedAgencyMaidIds.length} selected profiles`,
      isBulk: true,
    })
  }

  async function approveAgency(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setIsApprovingAgency(true)
    try {
      await apiRequest(`/admin/agencies/${adminAgencyId}/approve`, { method: 'PATCH', token })
      setMessage('Agency approved.')
      setAdminAgencyId('')
      queryClient.invalidateQueries({ queryKey: ['admin-pending-agencies', token] })
      queryClient.invalidateQueries({ queryKey: ['admin-activated-agencies', token] })
    } catch (err) {
      if (err.message === 'Session expired. Please login again.') {
        logout()
        navigate('/login')
        return
      }
      setError(err.message)
    } finally {
      setIsApprovingAgency(false)
    }
  }

  async function activateSubscription(event) {
    event.preventDefault()
    setMessage('')
    setError('')

    if (!String(adminSubscriptionId).trim()) {
      setError('Subscription ID is required.')
      return
    }

    setIsActivatingSubscription(true)
    try {
      await apiRequest(`/admin/subscriptions/${adminSubscriptionId}/activate`, { method: 'PATCH', token })
      setMessage('Subscription activated.')
      setAdminSubscriptionId('')
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions', token] })
      queryClient.invalidateQueries({ queryKey: ['admin-activated-agencies', token] })
    } catch (err) {
      if (err.message === 'Session expired. Please login again.') {
        logout()
        navigate('/login')
        return
      }
      setError(err.message)
    } finally {
      setIsActivatingSubscription(false)
    }
  }

  async function moderateAgency(agencyId, action) {
    if (!agencyId || !action) return
    setMessage('')
    setError('')
    setAgencyModerationInFlightId(Number(agencyId))
    try {
      await apiRequest(`/admin/agencies/${agencyId}/${action}`, { method: 'PATCH', token })
      setMessage(`Agency ${action} action applied.`)
      queryClient.invalidateQueries({ queryKey: ['admin-activated-agencies', token] })
      queryClient.invalidateQueries({ queryKey: ['admin-pending-agencies', token] })
    } catch (err) {
      if (err.message === 'Session expired. Please login again.') {
        logout()
        navigate('/login')
        return
      }
      setError(err.message)
    } finally {
      setAgencyModerationInFlightId(null)
    }
  }

  function requestModerationAction(agency, action) {
    setPendingModerationAction({
      agencyId: agency.agency_id,
      agencyEmail: agency.email || `Agency #${agency.agency_id}`,
      action,
    })
  }

  function closeModerationModal() {
    setPendingModerationAction(null)
  }

  async function confirmModerationAction() {
    if (!pendingModerationAction) return
    await moderateAgency(pendingModerationAction.agencyId, pendingModerationAction.action)
    setPendingModerationAction(null)
  }

  const adminSubscriptions = useMemo(() => subscriptionsQuery.data || [], [subscriptionsQuery.data])
  const pendingAgencies = useMemo(() => pendingAgenciesQuery.data || [], [pendingAgenciesQuery.data])
  const activatedAgencies = useMemo(() => activatedAgenciesQuery.data || [], [activatedAgenciesQuery.data])

  const sortedActivatedAgencies = useMemo(
    () => sortRows(activatedAgencies, activatedSort),
    [activatedAgencies, activatedSort],
  )
  const sortedPendingAgencies = useMemo(
    () => sortRows(pendingAgencies, pendingSort),
    [pendingAgencies, pendingSort],
  )
  const sortedSubscriptions = useMemo(
    () => sortRows(adminSubscriptions, subscriptionSort),
    [adminSubscriptions, subscriptionSort],
  )
  const visitStats = visitStatsQuery.data || {}
  const topEmployers = useMemo(() => visitStats.top_employers || [], [visitStats.top_employers])
  const sortedTopEmployers = useMemo(
    () => sortRows(topEmployers, visitsSort),
    [topEmployers, visitsSort],
  )

  const activatedPageData = useMemo(
    () => paginateItems(sortedActivatedAgencies, activatedPage, PAGE_SIZE_TABLE),
    [sortedActivatedAgencies, activatedPage],
  )
  const pendingPageData = useMemo(
    () => paginateItems(sortedPendingAgencies, pendingAgencyPage, PAGE_SIZE_TABLE),
    [sortedPendingAgencies, pendingAgencyPage],
  )
  const subscriptionsPageData = useMemo(
    () => paginateItems(sortedSubscriptions, subscriptionPage, PAGE_SIZE_TABLE),
    [sortedSubscriptions, subscriptionPage],
  )
  const visitsPageData = useMemo(
    () => paginateItems(sortedTopEmployers, visitsPage, PAGE_SIZE_TABLE),
    [sortedTopEmployers, visitsPage],
  )
  const pendingSubscriptions = adminSubscriptions.filter((sub) => String(sub.status || '').toUpperCase() === 'PENDING')
  const failedSubscriptions = adminSubscriptions.filter((sub) => String(sub.status || '').toUpperCase() === 'FAILED')
  async function updateAgencyContact(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setIsSavingContact(true)
    try {
      const data = await apiRequest('/agency/contact', {
        method: 'PATCH',
        token,
        body: { phone: agencyWhatsappPhone },
      })
      setAgencyWhatsappPhoneDraft(data.phone || agencyWhatsappPhone)
      setMessage('Agency WhatsApp contact updated.')
      queryClient.invalidateQueries({ queryKey: ['agency-contact', token] })
      queryClient.invalidateQueries({ queryKey: ['maids'] })
    } catch (err) {
      if (err.message === 'Session expired. Please login again.') {
        logout()
        navigate('/login')
        return
      }
      setError(err.message)
    } finally {
      setIsSavingContact(false)
    }
  }

  async function copyProfileLink(maidId) {
    try {
      await navigator.clipboard.writeText(getMaidProfileLink(maidId))
      setMessage('Profile link copied.')
    } catch {
      setError('Unable to copy link from this browser.')
    }
  }

  async function shareMaidProfile(maid) {
    const profileUrl = getMaidProfileLink(maid.ID)
    const text = `${maid.name} profile - ${profileUrl}`

    try {
      if (navigator.share) {
        await navigator.share({ title: maid.name, text, url: profileUrl })
        setMessage('Profile shared successfully.')
        return
      }

      await navigator.clipboard.writeText(text)
      setMessage('Share text copied. You can paste it anywhere.')
    } catch {
      setError('Unable to share right now. Please try again.')
    }
  }

  function onApplyFilters() {
    setMessage('Filters applied. Updating results...')
    setAppliedFilters(filters)
  }

  function onOpenAllProfiles() {
    navigate('/dashboard')
  }

  function onOpenMaidDetails(maid) {
    recordRecentView(maid)
    setMessage(`Opening ${maid.name} profile...`)
    navigate(`/dashboard/maids/${maid.ID}`)
  }

  function onRefreshBrowse() {
    setMessage('Refreshing profiles...')
    browseQuery.refetch()
  }

  function onRefreshMyProfiles() {
    setMessage('Refreshing your profiles...')
    myMaidsQuery.refetch()
  }

  function onRefreshAdminData() {
    setMessage('Refreshing admin analytics...')
    subscriptionsQuery.refetch()
    pendingAgenciesQuery.refetch()
    activatedAgenciesQuery.refetch()
    visitStatsQuery.refetch()
  }

  function onLogout() {
    logout()
    navigate('/login')
  }

  async function deleteEmployerAccount() {
    setMessage('')
    setError('')
    setIsDeletingAccount(true)
    try {
      await apiRequest('/account', { method: 'DELETE', token })
      window.localStorage.removeItem(employerSavedKey)
      window.localStorage.removeItem(employerContactedKey)
      logout()
      setPendingDeleteAccount(false)
      navigate('/register')
    } catch (err) {
      if (err.message === 'Session expired. Please login again.') {
        logout()
        navigate('/login')
        return
      }
      setError(err.message)
    } finally {
      setIsDeletingAccount(false)
    }
  }

  function toggleSort(setter, current, nextKey) {
    if (current.key === nextKey) {
      setter({ key: nextKey, direction: current.direction === 'asc' ? 'desc' : 'asc' })
      return
    }
    setter({ key: nextKey, direction: 'asc' })
  }

  function renderPager(page, totalPages, setPage) {
    if (totalPages <= 1) return null
    return (
      <div className="pager" role="navigation" aria-label="Pagination">
        <button className="btn secondary pager-btn" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="muted">Page {page} of {totalPages}</span>
        <button className="btn secondary pager-btn" type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    )
  }

  return (
    <main className="app" aria-busy={isDashboardBusy}>
      <header className="hero">
        <div className="brand-row">
          <img className="brand-logo" src={brandLogo} alt="SimFlow logo" />
          <div>
            <p className="brand-kicker">SimFlow</p>
            <h1>{roleHero.title}</h1>
          </div>
        </div>
        <p className="hero-subtitle">{roleHero.subtitle}</p>
        <div className="hero-actions-row">
          <button className="btn hero-primary-cta" type="button" onClick={roleHero.ctaAction}>{roleHero.ctaLabel}</button>
          <div className="hero-trust-chips" aria-label="Trust indicators">
            <span className="trust-chip">Verified agencies: {trustStats.verifiedAgencies}</span>
            <span className="trust-chip">Target response: &lt;2h</span>
            <span className="trust-chip">Active candidates: {trustStats.activeCandidates}</span>
          </div>
        </div>
        <div className="live-status" role="status" aria-live="polite">
          <span className={`live-dot ${isDashboardBusy ? 'is-busy' : ''}`} aria-hidden="true" />
          <span>{isDashboardBusy ? 'Updating dashboard data...' : 'Dashboard is ready.'}</span>
        </div>
        {user && (
          <div className="user-row">
            <span>{user.email} ({user.role})</span>
            {!isAgency && (
              <div className="dashboard-tabs" role="tablist" aria-label="Dashboard sections">
                <button className={`btn secondary tab-btn ${activeView === 'browse' ? 'is-active' : ''}`} onClick={() => setActiveView('browse')} type="button">Browse</button>
                {isAdmin && <button className={`btn secondary tab-btn ${activeView === 'admin' ? 'is-active' : ''}`} onClick={() => setActiveView('admin')} type="button">Admin</button>}
              </div>
            )}
            {isAgency ? (
              <button className="btn secondary tiny-signout-btn top-signout-btn" onClick={onLogout} type="button">Sign out</button>
            ) : (
              <button className="btn secondary" onClick={onLogout}>Logout</button>
            )}
          </div>
        )}
      </header>

      <section className="toast-stack" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <article key={toast.id} className={`toast-item ${toast.type === 'err' ? 'err' : 'ok'}`}>
            <span>{toast.text}</span>
          </article>
        ))}
      </section>

      {isEmployer && showBrowseView && (
        <section className="grid three role-grid">
          <article className="card elevated role-panel">
            <h3>Saved Profiles</h3>
            <p className="muted">Shortlist profiles to revisit quickly.</p>
            {savedProfiles.length === 0 && (
              <div className="empty-state">
                <p className="muted">No saved profiles yet.</p>
                <button className="btn secondary table-action-btn" type="button" onClick={() => document.getElementById('browse-profiles-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Start Browsing</button>
              </div>
            )}
            <ul className="list-clean role-list">
              {savedProfiles.slice(0, 5).map((entry) => (
                <li key={`saved-${entry.id}`}>
                  <span>{entry.name} • {entry.availability || '-'}</span>
                  <button className="btn secondary table-action-btn" type="button" onClick={() => navigate(`/dashboard/maids/${entry.id}`)}>Open</button>
                </li>
              ))}
            </ul>
          </article>

          <article className="card elevated role-panel">
            <h3>Recent Views</h3>
            <p className="muted">Profiles viewed in your latest sessions.</p>
            {recentViews.length === 0 && (
              <div className="empty-state">
                <p className="muted">No recent views yet.</p>
                <button className="btn secondary table-action-btn" type="button" onClick={() => document.getElementById('browse-profiles-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>View Candidates</button>
              </div>
            )}
            <ul className="list-clean role-list">
              {recentViews.slice(0, 5).map((entry) => (
                <li key={`recent-${entry.id}`}>
                  <span>{entry.name} • {formatRelativeDate(entry.viewed_at)}</span>
                  <button className="btn secondary table-action-btn" type="button" onClick={() => navigate(`/dashboard/maids/${entry.id}`)}>Open</button>
                </li>
              ))}
            </ul>
          </article>

          <article className="card elevated role-panel">
            <h3>Contacted Agencies</h3>
            <p className="muted">Track who you already contacted.</p>
            {contactedAgencies.length === 0 && (
              <div className="empty-state">
                <p className="muted">No agencies contacted yet.</p>
                <button className="btn secondary table-action-btn" type="button" onClick={() => document.getElementById('browse-profiles-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Contact an Agency</button>
              </div>
            )}
            <ul className="list-clean role-list">
              {contactedAgencies.slice(0, 5).map((entry) => (
                <li key={`contact-${entry.agency_ref}`}>
                  <span>{entry.maid_name} • {entry.phone || 'No phone'}</span>
                  <button className="btn secondary table-action-btn" type="button" onClick={() => navigate(`/dashboard/maids/${entry.maid_id}`)}>View</button>
                </li>
              ))}
            </ul>
          </article>

          <article className="card elevated role-panel danger-zone-panel">
            <h3>Account Settings</h3>
            <p className="muted">If you no longer need this employer account, you can permanently remove it.</p>
            <button className="btn danger" type="button" onClick={() => setPendingDeleteAccount(true)}>Delete My Account</button>
          </article>
        </section>
      )}

      {showBrowseView && (
        <section className="card browse-card" id="browse-profiles-section">
          <div className="section-head">
            <h2>{routedMaidId !== null ? 'Profile Details' : 'Browse Profiles'}</h2>
            <div>
              {routedMaidId !== null && (
                <button className="btn secondary" onClick={onOpenAllProfiles}>Back to All Profiles</button>
              )}
              <button className="btn secondary" onClick={onRefreshBrowse}>Refresh</button>
            </div>
          </div>
          <div className="grid four">
            <input placeholder="Age min" value={filters.age_min} onChange={(e) => setFilters({ ...filters, age_min: e.target.value })} />
            <input placeholder="Age max" value={filters.age_max} onChange={(e) => setFilters({ ...filters, age_max: e.target.value })} />
            <select value={filters.experience_min} onChange={(e) => setFilters({ ...filters, experience_min: e.target.value })}>
              <option value="">Min experience</option>
              {EXPERIENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select value={filters.availability_status} onChange={(e) => setFilters({ ...filters, availability_status: e.target.value })}>
              <option value="">Any status</option>
              <option value="AVAILABLE">AVAILABLE</option>
              <option value="ARRIVED">ARRIVED</option>
              <option value="NOT_AVAILABLE">NOT_AVAILABLE</option>
              <option value="BOOKED">BOOKED</option>
            </select>
            <input placeholder="Language" value={filters.lang} onChange={(e) => setFilters({ ...filters, lang: e.target.value })} />
            <input placeholder="Search by name, skill, language" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <p className="muted section-note">Note: `AVAILABLE` profiles are usually shown first in browse results.</p>
          <button className="btn" onClick={onApplyFilters}>Apply Filters</button>
          {!browseQuery.isLoading && <p className="muted results-count">{searchedMaids.length} results found.</p>}

          {browseQuery.isLoading && (
            <div className="maids-grid" aria-label="Loading profiles">
              {Array.from({ length: 6 }).map((_, index) => (
                <article className="maid-card skeleton-card" key={`skeleton-${index}`}>
                  <div className="media-wrap skeleton-block" />
                  <div className="maid-content">
                    <p className="skeleton-line" />
                    <p className="skeleton-line short" />
                    <p className="skeleton-line" />
                  </div>
                </article>
              ))}
            </div>
          )}
          {searchedMaids.length === 0 && !browseQuery.isLoading && routedMaidId === null && <p className="muted">No profiles match your filters.</p>}
          {searchedMaids.length === 0 && !browseQuery.isLoading && routedMaidId !== null && <p className="muted">This profile could not be found.</p>}

          <div className="maids-grid">
            {browsePageData.pageItems.map((maid) => (
              <article
                className={`maid-card ${routedMaidId === maid.ID ? 'maid-card-active' : ''}`}
                key={maid.ID}
                id={`maid-${maid.ID}`}
                onClick={() => onOpenMaidDetails(maid)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpenMaidDetails(maid)
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Open ${maid.name} details`}
              >
                <div className="media-wrap">
                  {maid.photo_url ? (
                    <img src={mediaUrl(maid.photo_url)} alt={`${maid.name} profile`} className="media-photo" />
                  ) : (
                    <div className="media-placeholder">No Photo</div>
                  )}
                </div>
                <div className="maid-content">
                  <h3>{maid.name}</h3>
                  <p>{maid.age} years • {maid.experience_years} years experience</p>
                  {maid.expected_salary && <p>Expected salary: {maid.expected_salary}</p>}
                  <p>{maid.languages}</p>
                  {maid.narrative && <p className="muted">{maid.narrative}</p>}
                  <p className="muted meta-row">{formatRelativeDate(maid.last_updated_at || maid.UpdatedAt)}</p>
                  <p className="muted meta-row">Agency: {maid.agency_verified ? 'Verified' : 'Pending verification'}</p>
                  <span className="status-pill">{maid.availability_status}</span>

                  {(() => {
                    const contactNumber = maid.agency_whatsapp || maid.agency_phone
                    const contactUrl = buildWhatsAppDirectUrl({
                      phone: contactNumber,
                      whatsAppUrl: maid.agency_whatsapp_url,
                      message: buildMaidDiscussionMessage(maid),
                    })
                    return (
                      <div className="icon-actions">
                        {isEmployer && (
                          <button
                            className="btn secondary save-profile-btn"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleSavedProfile(maid)
                            }}
                          >
                            {savedProfiles.some((entry) => entry.id === maid.ID) ? 'Saved' : 'Save'}
                          </button>
                        )}
                        {contactUrl && (
                          <button
                            className="icon-btn"
                            aria-label={`Contact agency on WhatsApp for ${maid.name}`}
                            title="Contact on WhatsApp"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              requestVisitorContactAction(maid, contactUrl)
                            }}
                          >
                            <WhatsAppIcon />
                          </button>
                        )}
                        <button
                          className="icon-btn secondary"
                          aria-label={`Share ${maid.name} profile`}
                          title="Share profile"
                          onClick={(event) => {
                            event.stopPropagation()
                            shareMaidProfile(maid)
                          }}
                          type="button"
                        >
                          <ShareIcon />
                        </button>
                        <a
                          className="icon-btn secondary"
                          href={getMaidProfileLink(maid.ID)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open public profile for ${maid.name}`}
                          title="Open public profile"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <span className="icon-btn-text">View</span>
                        </a>
                      </div>
                    )
                  })()}

                  {maid.intro_video_url && (
                    <video controls className="media-video" src={mediaUrl(maid.intro_video_url)} />
                  )}
                </div>
              </article>
            ))}
          </div>
          {renderPager(browsePageData.safePage, browsePageData.totalPages, setBrowsePage)}

          {routedMaidId !== null && searchedMaids[0] && (
            <section className="maid-detail-panel" aria-label="Maid actual details">
              <h3>Actual Maid Data</h3>
              <div className="maid-detail-grid">
                <p><strong>ID:</strong> {searchedMaids[0].ID}</p>
                <p><strong>Name:</strong> {searchedMaids[0].name}</p>
                <p><strong>Age:</strong> {searchedMaids[0].age}</p>
                <p><strong>Experience:</strong> {searchedMaids[0].experience_years} years</p>
                <p><strong>Languages:</strong> {searchedMaids[0].languages || '-'}</p>
                <p><strong>Narrative:</strong> {searchedMaids[0].narrative || '-'}</p>
                <p><strong>Expected salary:</strong> {searchedMaids[0].expected_salary || '-'}</p>
                <p><strong>Availability:</strong> {searchedMaids[0].availability_status}</p>
                <p><strong>Agency verified:</strong> {searchedMaids[0].agency_verified ? 'Yes' : 'No'}</p>
                <p><strong>Agency phone:</strong> {searchedMaids[0].agency_phone || '-'}</p>
                <p><strong>Last updated:</strong> {searchedMaids[0].last_updated_at || searchedMaids[0].UpdatedAt || '-'}</p>
              </div>
            </section>
          )}
        </section>
      )}

      {showAgencyView && (
        <>
          <section className={`card elevated agency-onboarding-card ${isWhatsappConfigured ? 'is-ready' : 'is-required'}`} id="agency-whatsapp-onboarding">
            <div className="section-head">
              <h2>Employer Contact Setup</h2>
              {!isWhatsappConfigured && <span className="status-tag status-incomplete">Required</span>}
            </div>
            <p className="muted">
              {isWhatsappConfigured
                ? 'Your WhatsApp is configured. Employers can contact your agency directly.'
                : 'You need to set your WhatsApp number before employers can reach you.'}
            </p>
            <form onSubmit={updateAgencyContact} className="agency-contact-form">
              <label htmlFor="agency-whatsapp">WhatsApp number</label>
              <input
                id="agency-whatsapp"
                className={!isWhatsappConfigured ? 'input-invalid' : ''}
                placeholder="WhatsApp number (e.g. +251911223344)"
                value={agencyWhatsappPhone}
                onChange={(e) => setAgencyWhatsappPhoneDraft(e.target.value)}
              />
              <div className="crud-actions">
                <button className="btn" type="submit">Save WhatsApp Number</button>
                {agencyContactQuery.data?.whatsapp_url && (
                  <a className="btn secondary" href={agencyContactQuery.data.whatsapp_url} target="_blank" rel="noreferrer">Open My WhatsApp Link</a>
                )}
              </div>
              {isSavingContact && <p className="muted">Saving contact...</p>}
            </form>
          </section>

          <section className="grid three role-grid">
            <article className="card elevated role-panel role-panel-action" onClick={() => applyAgencyFilter('incomplete')}>
              <h3>Listing Health Score</h3>
              <h2 className="role-score">{agencyAvgHealth}%</h2>
              <p className="muted">Fill salary and languages to move toward 100%.</p>
              <button className="btn secondary table-action-btn" type="button">Fix Incomplete Profiles</button>
            </article>
            <article className="card elevated role-panel role-panel-action" onClick={() => applyAgencyFilter('incomplete')}>
              <h3>Missing Fields</h3>
              <h2 className="role-score">{agencyMissingCoverage}</h2>
              <p className="muted">Click to focus profiles missing key fields.</p>
              <button className="btn secondary table-action-btn" type="button">Show Incomplete</button>
            </article>
            <article className="card elevated role-panel role-panel-action" onClick={() => applyAgencyFilter('missing-photo')}>
              <h3>Profile Performance</h3>
              <h2 className="role-score">{agencyProfilesWithMedia}/{agencyMaids.length}</h2>
              <p className="muted">Upload photos to improve profile trust and visibility.</p>
              <button className="btn secondary table-action-btn" type="button">Highlight Missing Photos</button>
            </article>
          </section>

          {agencyTopProfiles.length > 0 && (
            <section className="card elevated role-panel">
              <div className="section-head">
                <h3>Top Performing Profiles</h3>
              </div>
              <ul className="list-clean role-list">
                {agencyTopProfiles.map((maid) => (
                  <li key={`top-${maid.ID}`}>
                    <span>{maid.name} • Health {maid.health}% {maid.missing.length ? `• Missing: ${maid.missing.join(', ')}` : '• Complete'}</span>
                    <button className="btn secondary table-action-btn" type="button" onClick={() => startEditMaid(maid)}>Improve</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card full" id="agency-profiles-section">
            <div className="section-head">
              <h2>My Profiles</h2>
              <div className="crud-actions">
                <button className="btn secondary" type="button" onClick={onRefreshMyProfiles}>Refresh</button>
                <button className="btn" type="button" onClick={() => {
                  setShowAgencyForm((prev) => !prev)
                  setEditingMaidId(null)
                  setEditPhotoFile(null)
                  setEditVideoFile(null)
                  setTimeout(() => document.getElementById('agency-create-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
                }}>
                  {showAgencyForm ? 'Close Form' : 'Add Profile'}
                </button>
              </div>
            </div>

            <div className="crud-actions agency-filter-bar" role="group" aria-label="Profile filters">
              <button className={`btn secondary table-action-btn ${agencyProfileFilter === 'all' ? 'is-active' : ''}`} type="button" onClick={() => setAgencyProfileFilter('all')}>All</button>
              <button className={`btn secondary table-action-btn ${agencyProfileFilter === 'incomplete' ? 'is-active' : ''}`} type="button" onClick={() => setAgencyProfileFilter('incomplete')}>Incomplete</button>
              <button className={`btn secondary table-action-btn ${agencyProfileFilter === 'missing-photo' ? 'is-active' : ''}`} type="button" onClick={() => setAgencyProfileFilter('missing-photo')}>Missing Photo</button>
              <button className={`btn secondary table-action-btn ${agencyProfileFilter === 'arrived' ? 'is-active' : ''}`} type="button" onClick={() => setAgencyProfileFilter('arrived')}>Arrived</button>
              <button className={`btn secondary table-action-btn ${agencyProfileFilter === 'hidden' ? 'is-active' : ''}`} type="button" onClick={() => setAgencyProfileFilter('hidden')}>Hidden</button>
            </div>

            <div className="crud-actions bulk-actions-bar">
              <label className="bulk-select-toggle">
                <input
                  type="checkbox"
                  checked={filteredAgencyMaids.length > 0 && filteredAgencyMaids.every((maid) => selectedAgencyMaidIds.includes(maid.ID))}
                  onChange={toggleSelectAllFilteredAgencyMaids}
                />
                Select visible
              </label>
              <button className="btn secondary table-action-btn" type="button" onClick={() => bulkUpdateAvailability('BOOKED')}>Mark BOOKED</button>
              <button className="btn secondary table-action-btn" type="button" onClick={() => bulkUpdateAvailability('ARRIVED')}>Mark ARRIVED</button>
              <button className="btn secondary table-action-btn" type="button" onClick={() => bulkUpdateAvailability('NOT_AVAILABLE')}>Mark NOT_AVAILABLE</button>
              <button className="btn danger table-action-btn" type="button" onClick={requestBulkDelete}>Delete Selected</button>
            </div>

            {myMaidsQuery.isLoading && (
              <div className="list-skeleton-wrap" aria-label="Loading agency profiles">
                {Array.from({ length: 4 }).map((_, index) => <p className="skeleton-line" key={`agency-skeleton-${index}`} />)}
              </div>
            )}
            {!myMaidsQuery.isLoading && filteredAgencyMaids.length === 0 && (
              <div className="empty-state">
                <p className="muted">No profiles yet. Start by adding your first maid profile.</p>
                <button className="btn" type="button" onClick={() => setShowAgencyForm(true)}>Add First Profile</button>
              </div>
            )}

            <div className="agency-profile-cards">
              {filteredAgencyMaids.map((maid) => {
                const visibility = getAgencyProfileVisibility(maid)
                const missing = getMaidMissingFields(maid)
                const completeness = getMaidCompleteness(maid)
                return (
                  <article
                    key={maid.ID}
                    className={`agency-profile-card ${editingMaidId === maid.ID ? 'is-editing' : ''} ${editingMaidPulseId === maid.ID ? 'is-edit-pulse' : ''}`}
                  >
                    <div className="agency-profile-media">
                      {maid.photo_url ? (
                        <img src={mediaUrl(maid.photo_url)} alt={`${maid.name} thumbnail`} className="media-photo" />
                      ) : (
                        <div className="media-placeholder">No Photo</div>
                      )}
                    </div>
                    <div className="agency-profile-body">
                      <div className="section-head">
                        <h3 className="profile-name-ellipsis">{maid.name}</h3>
                        <label className="bulk-select-toggle">
                          <input
                            type="checkbox"
                            checked={selectedAgencyMaidIds.includes(maid.ID)}
                            onChange={() => toggleAgencyMaidSelection(maid.ID)}
                          />
                          Select
                        </label>
                      </div>
                      <p className="muted">{maid.age} years • {maid.experience_years} years • {maid.languages || '-'}</p>
                      <p className="muted">Salary: {maid.expected_salary || '-'}</p>
                      <div className="maid-completeness">
                        <div className="progress-track" aria-label="Profile completeness progress">
                          <span className="progress-fill" style={{ width: `${completeness}%` }} />
                        </div>
                        <p className="muted">Completeness: {completeness}% {missing.length ? `• Missing: ${missing.join(', ')}` : '• Complete profile'}</p>
                      </div>
                      <div className="crud-actions">
                        <span className={`status-tag ${visibility.className}`}>{visibility.label}</span>
                        <span className="status-tag status-active">{maid.availability_status}</span>
                        {editingMaidId === maid.ID && <span className="status-tag status-editing">Editing now</span>}
                      </div>
                      <div className="crud-actions inline-availability-row">
                        <label htmlFor={`availability-${maid.ID}`}>Availability</label>
                        <select
                          id={`availability-${maid.ID}`}
                          value={maid.availability_status || 'AVAILABLE'}
                          onChange={(event) => quickUpdateAvailability(maid, event.target.value)}
                        >
                          {AVAILABILITY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="crud-actions">
                        <button className="btn secondary" type="button" onClick={() => startEditMaid(maid)}>Edit</button>
                        <button className="btn secondary" type="button" onClick={() => window.open(getMaidProfileLink(maid.ID), '_blank', 'noopener,noreferrer')}>Preview</button>
                        <button className="btn danger" type="button" onClick={() => setPendingDeleteMaid(maid)}>Delete</button>
                        <button className="btn secondary" type="button" onClick={() => copyProfileLink(maid.ID)}>Copy Link</button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          {showAgencyForm && (
            <section className={`card elevated agency-form-panel ${editingMaidId ? 'is-editing' : ''}`} id="agency-create-section">
              <div className="section-head">
                <h2>{editingMaidId ? 'Edit Maid Profile' : 'Create Maid Profile'}</h2>
                {editingMaidId && (
                  <button className="btn secondary" type="button" onClick={cancelEditMaid}>Cancel Edit</button>
                )}
              </div>
              {editingMaidId && editingMaid && (
                <div className="edit-live-banner" role="status" aria-live="polite">
                  <strong>Editing:</strong> {editingMaid.name} • {editingMaid.age} years • {editingMaid.availability_status}
                </div>
              )}
              <p className="muted">Upload real photo and optional intro video file (not URL).</p>

              <form onSubmit={editingMaidId ? (event) => {
                event.preventDefault()
                updateMaid(editingMaidId)
              } : createMaid}>
                <label htmlFor="maid-name">Name</label>
                <input
                  id="maid-name"
                  className={!editingMaidId && maidFormErrors.name ? 'input-invalid' : ''}
                  placeholder="Name"
                  value={editingMaidId ? editMaidForm.name : maidForm.name}
                  onChange={(e) => (editingMaidId
                    ? setEditMaidForm({ ...editMaidForm, name: e.target.value })
                    : setMaidForm({ ...maidForm, name: e.target.value }))}
                />
                {!editingMaidId && maidFormErrors.name && <p className="field-error">{maidFormErrors.name}</p>}

                <label htmlFor="maid-age">Age</label>
                <input
                  id="maid-age"
                  className={!editingMaidId && maidFormErrors.age ? 'input-invalid' : ''}
                  placeholder="Age"
                  min={18}
                  type="number"
                  value={editingMaidId ? editMaidForm.age : maidForm.age}
                  onChange={(e) => (editingMaidId
                    ? setEditMaidForm({ ...editMaidForm, age: e.target.value })
                    : setMaidForm({ ...maidForm, age: e.target.value }))}
                />
                {!editingMaidId && maidFormErrors.age && <p className="field-error">{maidFormErrors.age}</p>}

                <label htmlFor="maid-exp">Experience</label>
                <select
                  id="maid-exp"
                  value={editingMaidId ? editMaidForm.experience_years : maidForm.experience_years}
                  onChange={(e) => (editingMaidId
                    ? setEditMaidForm({ ...editMaidForm, experience_years: Number(e.target.value) })
                    : setMaidForm({ ...maidForm, experience_years: Number(e.target.value) }))}
                >
                  {EXPERIENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>

                <label htmlFor="maid-salary">Expected Salary</label>
                <input
                  id="maid-salary"
                  className={!editingMaidId && maidFormErrors.expected_salary ? 'input-invalid' : ''}
                  placeholder="Expected salary (e.g. 2500 SAR / month)"
                  value={editingMaidId ? editMaidForm.expected_salary : maidForm.expected_salary}
                  onChange={(e) => (editingMaidId
                    ? setEditMaidForm({ ...editMaidForm, expected_salary: e.target.value })
                    : setMaidForm({ ...maidForm, expected_salary: e.target.value }))}
                />
                {!editingMaidId && maidFormErrors.expected_salary && <p className="field-error">{maidFormErrors.expected_salary}</p>}

                <label htmlFor="maid-languages">Languages</label>
                <input
                  id="maid-languages"
                  className={!editingMaidId && maidFormErrors.languages ? 'input-invalid' : ''}
                  placeholder="Languages (comma-separated)"
                  value={editingMaidId ? editMaidForm.languages : maidForm.languages}
                  onChange={(e) => (editingMaidId
                    ? setEditMaidForm({ ...editMaidForm, languages: e.target.value })
                    : setMaidForm({ ...maidForm, languages: e.target.value }))}
                />
                {!editingMaidId && maidFormErrors.languages && <p className="field-error">{maidFormErrors.languages}</p>}

                {editingMaidId && (
                  <>
                    <label htmlFor="maid-narrative">Narrative</label>
                    <textarea
                      id="maid-narrative"
                      placeholder="Narrative"
                      value={editMaidForm.narrative}
                      onChange={(e) => setEditMaidForm({ ...editMaidForm, narrative: e.target.value })}
                      rows={4}
                    />
                    <p className="muted section-note">Note: Write a short description about skills, personality, and strengths.</p>
                  </>
                )}

                <label htmlFor="maid-availability">Availability</label>
                <select
                  id="maid-availability"
                  value={editingMaidId ? editMaidForm.availability_status : maidForm.availability_status}
                  onChange={(e) => (editingMaidId
                    ? setEditMaidForm({ ...editMaidForm, availability_status: e.target.value })
                    : setMaidForm({ ...maidForm, availability_status: e.target.value }))}
                >
                  {AVAILABILITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>

                <label className="file-label">Photo</label>
                <input
                  className={!editingMaidId && maidFormErrors.photo ? 'input-invalid' : ''}
                  type="file"
                  accept="image/*"
                  onChange={(e) => (editingMaidId
                    ? setEditPhotoFile(e.target.files?.[0] || null)
                    : setPhotoFile(e.target.files?.[0] || null))}
                />
                {!editingMaidId && maidFormErrors.photo && <p className="field-error">{maidFormErrors.photo}</p>}

                <label className="file-label">Intro Video (Optional)</label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => (editingMaidId
                    ? setEditVideoFile(e.target.files?.[0] || null)
                    : setVideoFile(e.target.files?.[0] || null))}
                />

                <div className="crud-actions">
                  <button className="btn" type="submit" disabled={!editingMaidId && isCreatingMaid}>
                    {editingMaidId ? 'Save & Publish Changes' : (isCreatingMaid ? 'Adding maid...' : 'Create Profile')}
                  </button>
                  <button className="btn secondary" type="button" onClick={() => setShowAgencyForm(false)}>Close</button>
                </div>
              </form>
            </section>
          )}
        </>
      )}

      {isAdmin && activeView === 'admin' && (
        <section className="admin-dashboard">
          <article className="admin-hero glass-panel">
            <div>
              <p className="admin-kicker">Operations Center</p>
              <h2>Admin Command Dashboard</h2>
              <p className="muted">Approve agencies, review payment state, and activate subscriptions from one control surface.</p>
            </div>
            <button className="btn secondary" onClick={onRefreshAdminData}>
              {subscriptionsQuery.isFetching || pendingAgenciesQuery.isFetching || activatedAgenciesQuery.isFetching || visitStatsQuery.isFetching ? 'Refreshing...' : 'Refresh Analytics'}
            </button>
          </article>

          <article className="card elevated admin-notification-panel">
            <div className="section-head">
              <h3>Agency Registration Notifications</h3>
              <span className="status-tag status-live">{adminNotifications.length} events</span>
            </div>
            {adminNotifications.length === 0 ? (
              <p className="muted">No registration notifications yet. New agency signups will appear here in real-time.</p>
            ) : (
              <ul className="list-clean admin-notification-list">
                {adminNotifications.slice(0, 8).map((notification) => {
                  const createdAt = parseNotificationTimestamp(notification.createdAt)
                  return (
                    <li key={notification.id}>
                      <div>
                        <strong>{notification.agencyEmail || 'Agency registration'}</strong>
                        <p className="muted">{notification.country || '-'} • {notification.phone || '-'}</p>
                      </div>
                      <span className="muted">{createdAt ? formatRelativeDate(createdAt) : 'Just now'}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </article>

          <div className="admin-metric-grid">
            <article className="admin-metric-card">
              <p>Total Requests</p>
              <h3>{adminSubscriptions.length}</h3>
              <span className="metric-chip">Live</span>
            </article>
            <article className="admin-metric-card pending">
              <p>Pending Agencies</p>
              <h3>{pendingAgencies.length}</h3>
              <span className="metric-chip">Needs approval</span>
            </article>
            <article className="admin-metric-card pending">
              <p>Pending Payments</p>
              <h3>{pendingSubscriptions.length}</h3>
              <span className="metric-chip">Needs action</span>
            </article>
            <article className="admin-metric-card success">
              <p>Activated Agencies</p>
              <h3>{activatedAgencies.length}</h3>
              <span className="metric-chip">Healthy</span>
            </article>
            <article className="admin-metric-card danger">
              <p>Failed Payments</p>
              <h3>{failedSubscriptions.length}</h3>
              <span className="metric-chip">Review</span>
            </article>
            <article className="admin-metric-card">
              <p>Employer Visits</p>
              <h3>{visitStats.total_employer_visits || 0}</h3>
              <span className="metric-chip">Engagement</span>
            </article>
            <article className="admin-metric-card">
              <p>Agencies Visited</p>
              <h3>{visitStats.unique_agencies_visited || 0}</h3>
              <span className="metric-chip">Coverage</span>
            </article>
            <article className="admin-metric-card">
              <p>Unique Employers</p>
              <h3>{visitStats.unique_employers_visited || 0}</h3>
              <span className="metric-chip">Active audience</span>
            </article>
            <article className="admin-metric-card">
              <p>Visits (24h)</p>
              <h3>{visitStats.last_24h_visits || 0}</h3>
              <span className="metric-chip">Recent traffic</span>
            </article>
          </div>

          <section className="grid three role-grid">
            <article className="card elevated role-panel">
              <h3>Approval Queue SLA</h3>
              <h2 className="role-score">{adminSlaHours}h</h2>
              <p className="muted">Average waiting time for pending agency approvals.</p>
              <p className="muted">Breaches over 48h: <strong>{adminSlaBreaches}</strong></p>
            </article>
            <article className="card elevated role-panel">
              <h3>Subscription Health</h3>
              <h2 className="role-score">{subscriptionHealth.paidRate}%</h2>
              <p className="muted">Paid conversion rate across subscription requests.</p>
              <p className="muted">Failure rate: <strong>{subscriptionHealth.failureRate}%</strong></p>
            </article>
            <article className="card elevated role-panel">
              <h3>Activity Trend</h3>
              <h2 className="role-score">{activityTrend}%</h2>
              <p className="muted">Share of total visits generated in the last 24 hours.</p>
            </article>
          </section>

          <div className="grid two admin-tools-grid">
            <form onSubmit={approveAgency} className="card elevated admin-panel">
              <h3>Approve Agency</h3>
              <p className="muted">Use agency profile ID after reviewing onboarding details.</p>
              <label htmlFor="admin-agency-id">Agency ID</label>
              <input id="admin-agency-id" placeholder="Agency ID" value={adminAgencyId} onChange={(e) => setAdminAgencyId(e.target.value)} />
              <button className="btn" type="submit" disabled={isApprovingAgency}>
                {isApprovingAgency ? 'Approving...' : 'Approve Agency'}
              </button>
            </form>

            <form onSubmit={activateSubscription} className="card elevated admin-panel">
              <h3>Activate Subscription</h3>
              <p className="muted">Apply payment approval by subscription ID.</p>
              <label htmlFor="admin-subscription-id">Subscription ID</label>
              <input id="admin-subscription-id" placeholder="Subscription ID" value={adminSubscriptionId} onChange={(e) => setAdminSubscriptionId(e.target.value)} />
              <button className="btn" type="submit" disabled={isActivatingSubscription}>
                {isActivatingSubscription ? 'Activating...' : 'Activate Subscription'}
              </button>
            </form>
          </div>

          <article className="card elevated admin-table-panel" id="admin-approval-queue">
            <div className="section-head">
              <h3>Activated Agencies Using Platform</h3>
              <button className="btn secondary" onClick={() => activatedAgenciesQuery.refetch()}>Refresh Table</button>
            </div>

            {activatedAgenciesQuery.isLoading && <p className="muted">Loading activated agencies...</p>}
            {!activatedAgenciesQuery.isLoading && activatedAgencies.length === 0 && (
              <div className="empty-state">
                <p className="muted">No activated agencies yet.</p>
                <button className="btn secondary table-action-btn" type="button" onClick={() => setActiveView('browse')}>View Marketplace</button>
              </div>
            )}

            {activatedAgencies.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setActivatedSort, activatedSort, 'agency_id')}>Agency ID</button></th>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setActivatedSort, activatedSort, 'email')}>Email</button></th>
                      <th>Moderation</th>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setActivatedSort, activatedSort, 'subscription_status')}>Status</button></th>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setActivatedSort, activatedSort, 'maid_count')}>Maid Profiles</button></th>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setActivatedSort, activatedSort, 'last_login')}>Last Login</button></th>
                      <th>Controls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activatedPageData.pageItems.map((agency) => (
                      <tr key={agency.agency_id}>
                        <td>#{agency.agency_id}</td>
                        <td>{agency.email || '-'}</td>
                        <td>
                          {agency.banned ? (
                            <span className="status-tag status-banned">BANNED</span>
                          ) : agency.blocked ? (
                            <span className="status-tag status-blocked">BLOCKED</span>
                          ) : (
                            <span className="status-tag status-active">CLEAR</span>
                          )}
                        </td>
                        <td>
                          <span className={`status-tag status-${String(agency.subscription_status || '').toLowerCase()}`}>
                            {agency.subscription_status || '-'}
                          </span>
                        </td>
                        <td>{agency.maid_count ?? 0}</td>
                        <td>{agency.last_login ? formatRelativeDate(agency.last_login) : '-'}</td>
                        <td>
                          <div className="crud-actions">
                            {!agency.banned ? (
                              <button
                                className="btn danger table-action-btn"
                                type="button"
                                disabled={agencyModerationInFlightId === agency.agency_id}
                                onClick={() => requestModerationAction(agency, 'ban')}
                              >
                                Ban
                              </button>
                            ) : (
                              <button
                                className="btn secondary table-action-btn"
                                type="button"
                                disabled={agencyModerationInFlightId === agency.agency_id}
                                onClick={() => requestModerationAction(agency, 'unban')}
                              >
                                Unban
                              </button>
                            )}

                            {!agency.banned && (
                              agency.blocked ? (
                                <button
                                  className="btn secondary table-action-btn"
                                  type="button"
                                  disabled={agencyModerationInFlightId === agency.agency_id}
                                  onClick={() => requestModerationAction(agency, 'unblock')}
                                >
                                  Unblock
                                </button>
                              ) : (
                                <button
                                  className="btn secondary table-action-btn"
                                  type="button"
                                  disabled={agencyModerationInFlightId === agency.agency_id}
                                  onClick={() => requestModerationAction(agency, 'block')}
                                >
                                  Block
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {renderPager(activatedPageData.safePage, activatedPageData.totalPages, setActivatedPage)}
          </article>

          <article className="card elevated admin-table-panel">
            <div className="section-head">
              <h3>Pending Agency Registrations</h3>
              <button className="btn secondary" onClick={() => pendingAgenciesQuery.refetch()}>Refresh Table</button>
            </div>

            {pendingAgenciesQuery.isLoading && (
              <div className="list-skeleton-wrap" aria-label="Loading pending agencies">
                {Array.from({ length: 5 }).map((_, index) => <p className="skeleton-line" key={`pending-loading-${index}`} />)}
              </div>
            )}
            {!pendingAgenciesQuery.isLoading && pendingAgencies.length === 0 && (
              <div className="empty-state">
                <p className="muted">No pending agency registrations.</p>
                <button className="btn secondary table-action-btn" type="button" onClick={onRefreshAdminData}>Refresh Queue</button>
              </div>
            )}

            {pendingAgencies.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setPendingSort, pendingSort, 'agency_id')}>Agency ID</button></th>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setPendingSort, pendingSort, 'email')}>Email</button></th>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setPendingSort, pendingSort, 'country')}>Country</button></th>
                      <th>Phone</th>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setPendingSort, pendingSort, 'created_at')}>Registered</button></th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPageData.pageItems.map((agency) => (
                      <tr key={agency.agency_id}>
                        <td>#{agency.agency_id}</td>
                        <td>{agency.email || '-'}</td>
                        <td>{agency.country || '-'}</td>
                        <td>{agency.phone || '-'}</td>
                        <td>{formatRelativeDate(agency.created_at)}</td>
                        <td>
                          <button
                            className="btn secondary table-action-btn"
                            onClick={() => setAdminAgencyId(String(agency.agency_id))}
                            type="button"
                          >
                            Use ID
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {renderPager(pendingPageData.safePage, pendingPageData.totalPages, setPendingAgencyPage)}
          </article>

          <article className="card elevated admin-table-panel">
            <div className="section-head">
              <h3>Recent Subscription Requests</h3>
              <button className="btn secondary" onClick={() => subscriptionsQuery.refetch()}>Refresh Table</button>
            </div>

            {subscriptionsQuery.isLoading && (
              <div className="list-skeleton-wrap" aria-label="Loading subscription requests">
                {Array.from({ length: 5 }).map((_, index) => <p className="skeleton-line" key={`subs-loading-${index}`} />)}
              </div>
            )}
            {!subscriptionsQuery.isLoading && adminSubscriptions.length === 0 && (
              <div className="empty-state">
                <p className="muted">No subscription requests yet.</p>
                <button className="btn secondary table-action-btn" type="button" onClick={onRefreshAdminData}>Refresh Payments</button>
              </div>
            )}

            {adminSubscriptions.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setSubscriptionSort, subscriptionSort, 'ID')}>ID</button></th>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setSubscriptionSort, subscriptionSort, 'agency_id')}>Agency</button></th>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setSubscriptionSort, subscriptionSort, 'plan_type')}>Plan</button></th>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setSubscriptionSort, subscriptionSort, 'requested_months')}>Months</button></th>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setSubscriptionSort, subscriptionSort, 'status')}>Status</button></th>
                      <th>Transaction Ref</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptionsPageData.pageItems.map((sub) => {
                      const isPending = String(sub.status || '').toUpperCase() === 'PENDING'
                      return (
                        <tr key={sub.ID}>
                          <td>#{sub.ID}</td>
                          <td>{sub.agency_id}</td>
                          <td>{sub.plan_type || '-'}</td>
                          <td>{sub.requested_months || '-'}</td>
                          <td>
                            <span className={`status-tag status-${String(sub.status || '').toLowerCase()}`}>{sub.status || '-'}</span>
                          </td>
                          <td>{sub.transaction_ref || '-'}</td>
                          <td>
                            <button
                              className="btn secondary table-action-btn"
                              disabled={!isPending}
                              onClick={() => {
                                setAdminSubscriptionId(String(sub.ID))
                              }}
                              type="button"
                            >
                              Use ID
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {renderPager(subscriptionsPageData.safePage, subscriptionsPageData.totalPages, setSubscriptionPage)}
          </article>

          <article className="card elevated admin-table-panel">
            <div className="section-head">
              <h3>Top Employer Visits</h3>
              <button className="btn secondary" onClick={() => visitStatsQuery.refetch()}>Refresh Visits</button>
            </div>

            {visitStatsQuery.isLoading && (
              <div className="list-skeleton-wrap" aria-label="Loading visit metrics">
                {Array.from({ length: 4 }).map((_, index) => <p className="skeleton-line" key={`visit-loading-${index}`} />)}
              </div>
            )}
            {!visitStatsQuery.isLoading && topEmployers.length === 0 && (
              <div className="empty-state">
                <p className="muted">No employer visits tracked yet.</p>
                <button className="btn secondary table-action-btn" type="button" onClick={onRefreshAdminData}>Refresh Visits</button>
              </div>
            )}

            {topEmployers.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setVisitsSort, visitsSort, 'employer_id')}>Employer ID</button></th>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setVisitsSort, visitsSort, 'email')}>Email</button></th>
                      <th><button className="th-sort" type="button" onClick={() => toggleSort(setVisitsSort, visitsSort, 'visits')}>Visit Count</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitsPageData.pageItems.map((entry) => (
                      <tr key={entry.employer_id}>
                        <td>#{entry.employer_id}</td>
                        <td>{entry.email || '-'}</td>
                        <td>{entry.visits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {renderPager(visitsPageData.safePage, visitsPageData.totalPages, setVisitsPage)}
          </article>
        </section>
      )}

      {isEmployer && activeView !== 'browse' && (
        <section className="card">
          <p className="muted">Employers can browse and contact verified agencies from the Browse tab.</p>
        </section>
      )}

      {pendingModerationAction && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm agency moderation action">
          <div className="modal-card">
            <h3>Confirm {pendingModerationAction.action}</h3>
            <p>
              You are about to <strong>{pendingModerationAction.action}</strong> <strong>{pendingModerationAction.agencyEmail}</strong>.
              This action immediately changes the agency login access state.
            </p>
            <div className="modal-actions">
              <button className="btn secondary" type="button" onClick={closeModerationModal}>Cancel</button>
              <button className="btn danger" type="button" onClick={confirmModerationAction}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {pendingVisitorContactAction && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm agency contact action">
          <div className="modal-card">
            <h3>Contact Agency</h3>
            <p>
              You are about to contact the agency for <strong>{pendingVisitorContactAction.maid?.name}</strong> on WhatsApp.
            </p>
            <div className="modal-actions">
              <button className="btn secondary" type="button" onClick={closeVisitorContactModal}>Cancel</button>
              <button className="btn" type="button" onClick={confirmVisitorContactAction}>Continue</button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteAccount && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm account deletion">
          <div className="modal-card">
            <h3>Delete Employer Account</h3>
            <p>
              This will permanently delete your employer account and visit history. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn secondary" type="button" onClick={() => setPendingDeleteAccount(false)} disabled={isDeletingAccount}>Cancel</button>
              <button className="btn danger" type="button" onClick={deleteEmployerAccount} disabled={isDeletingAccount}>
                {isDeletingAccount ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteMaid && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm maid deletion">
          <div className="modal-card">
            <h3>Delete Maid Profile</h3>
            <p>
              You are about to permanently delete <strong>{pendingDeleteMaid.name}</strong>. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn secondary" type="button" onClick={() => setPendingDeleteMaid(null)}>Cancel</button>
              <button className="btn danger" type="button" onClick={confirmDeleteMaid}>Delete Profile</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
