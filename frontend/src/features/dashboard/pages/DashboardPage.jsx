import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { apiRequest, apiBase } from '../../../shared/api/client'
import { useAuth } from '../../auth/context/useAuth'
import {
  buildWhatsAppUrlFromPhone,
  formatRelativeDate,
  getMaidProfileLink,
  mediaUrl,
} from '../../../shared/lib/helpers'
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

function getMaidCompleteness(maid) {
  const checks = [
    Boolean(String(maid.name || '').trim()),
    Number(maid.age) >= 18,
    Boolean(String(maid.languages || '').trim()),
    Boolean(String(maid.expected_salary || '').trim()),
    Boolean(String(maid.photo_url || '').trim()),
    Boolean(String(maid.intro_video_url || '').trim()),
    String(maid.availability_status || '').toUpperCase() === 'AVAILABLE',
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
  if (String(maid.availability_status || '').toUpperCase() !== 'AVAILABLE') missing.push('availability not open')
  return missing
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
  const [editingMaidId, setEditingMaidId] = useState(null)
  const [editMaidForm, setEditMaidForm] = useState({
    name: '',
    age: 18,
    experience_years: 0,
    expected_salary: '',
    languages: '',
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
  const [isSavingContact, setIsSavingContact] = useState(false)

  const isAgency = user?.role === 'AGENCY'
  const isAdmin = user?.role === 'ADMIN'
  const isEmployer = user?.role === 'EMPLOYER'
  const employerSavedKey = `employer_saved_profiles_${user?.id || 'anon'}`
  const employerRecentKey = `employer_recent_views_${user?.id || 'anon'}`
  const employerContactedKey = `employer_contacted_agencies_${user?.id || 'anon'}`
  const showBrowseView = activeView === 'browse' || isAgency
  const showAgencyView = isAgency

  useEffect(() => {
    if (!isEmployer) return
    setSavedProfiles(readStoredList(employerSavedKey))
    setRecentViews(readStoredList(employerRecentKey))
    setContactedAgencies(readStoredList(employerContactedKey))
  }, [isEmployer, employerSavedKey, employerRecentKey, employerContactedKey])

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

  const agencyWhatsappPhone = agencyWhatsappPhoneDraft || agencyContactQuery.data?.phone || ''

  const queryError = browseQuery.error || myMaidsQuery.error || agencyContactQuery.error || subscriptionsQuery.error || pendingAgenciesQuery.error || activatedAgenciesQuery.error || visitStatsQuery.error
  const displayError = error || (queryError && queryError.message !== 'Session expired. Please login again.' ? queryError.message : '')

  useEffect(() => {
    if (queryError?.message === 'Session expired. Please login again.') {
      logout()
      navigate('/login')
    }
  }, [queryError, logout, navigate])

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

  const agencyMaids = useMemo(() => myMaidsQuery.data || [], [myMaidsQuery.data])
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
    const activeCandidates = maids.filter((maid) => String(maid.availability_status || '').toUpperCase() === 'AVAILABLE').length
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

  function persistSavedProfiles(next) {
    setSavedProfiles(next)
    writeStoredList(employerSavedKey, next)
  }

  function persistRecentViews(next) {
    setRecentViews(next)
    writeStoredList(employerRecentKey, next)
  }

  function persistContactedAgencies(next) {
    setContactedAgencies(next)
    writeStoredList(employerContactedKey, next)
  }

  function toggleSavedProfile(maid) {
    if (!isEmployer) return
    const exists = savedProfiles.some((entry) => entry.id === maid.ID)
    const next = exists
      ? savedProfiles.filter((entry) => entry.id !== maid.ID)
      : [{ id: maid.ID, name: maid.name, availability: maid.availability_status, saved_at: new Date().toISOString() }, ...savedProfiles].slice(0, 30)
    persistSavedProfiles(next)
    setMessage(exists ? 'Profile removed from saved list.' : 'Profile saved to your dashboard.')
  }

  function recordRecentView(maid) {
    if (!isEmployer) return
    const next = [
      { id: maid.ID, name: maid.name, viewed_at: new Date().toISOString(), availability: maid.availability_status },
      ...recentViews.filter((entry) => entry.id !== maid.ID),
    ].slice(0, 20)
    persistRecentViews(next)
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

  async function createMaid(event) {
    event.preventDefault()
    setMessage('')
    setError('')
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

  function startEditMaid(maid) {
    setEditingMaidId(maid.ID)
    setEditMaidForm({
      name: maid.name || '',
      age: Number(maid.age || 18),
      experience_years: Number(maid.experience_years || 0),
      expected_salary: maid.expected_salary || '',
      languages: maid.languages || '',
      availability_status: maid.availability_status || 'AVAILABLE',
    })
  }

  function cancelEditMaid() {
    setEditingMaidId(null)
  }

  async function updateMaid(id) {
    setMessage('')
    setError('')

    try {
      await apiRequest(`/agency/maids/${id}`, {
        method: 'PUT',
        token,
        body: {
          ...editMaidForm,
          age: Number(editMaidForm.age),
          experience_years: Number(editMaidForm.experience_years),
        },
      })

      setMessage('Maid profile updated.')
      setEditingMaidId(null)
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

  const adminSubscriptions = subscriptionsQuery.data || []
  const pendingAgencies = pendingAgenciesQuery.data || []
  const activatedAgencies = activatedAgenciesQuery.data || []
  const pendingSubscriptions = adminSubscriptions.filter((sub) => String(sub.status || '').toUpperCase() === 'PENDING')
  const failedSubscriptions = adminSubscriptions.filter((sub) => String(sub.status || '').toUpperCase() === 'FAILED')
  const visitStats = visitStatsQuery.data || {}
  const topEmployers = visitStats.top_employers || []

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
    setAppliedFilters(filters)
  }

  function onOpenAllProfiles() {
    navigate('/dashboard')
  }

  function onOpenMaidDetails(maid) {
    recordRecentView(maid)
    navigate(`/dashboard/maids/${maid.ID}`)
  }

  function onLogout() {
    logout()
    navigate('/login')
  }

  return (
    <main className="app">
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

      {message && <p className="banner ok" role="status" aria-live="polite">{message}</p>}
      {displayError && <p className="banner err" role="alert" aria-live="assertive">{displayError}</p>}

      {isEmployer && showBrowseView && (
        <section className="grid three role-grid">
          <article className="card elevated role-panel">
            <h3>Saved Profiles</h3>
            <p className="muted">Shortlist profiles to revisit quickly.</p>
            {savedProfiles.length === 0 && <p className="muted">No saved profiles yet.</p>}
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
            {recentViews.length === 0 && <p className="muted">No recent views yet.</p>}
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
            {contactedAgencies.length === 0 && <p className="muted">No agencies contacted yet.</p>}
            <ul className="list-clean role-list">
              {contactedAgencies.slice(0, 5).map((entry) => (
                <li key={`contact-${entry.agency_ref}`}>
                  <span>{entry.maid_name} • {entry.phone || 'No phone'}</span>
                  <button className="btn secondary table-action-btn" type="button" onClick={() => navigate(`/dashboard/maids/${entry.maid_id}`)}>View</button>
                </li>
              ))}
            </ul>
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
              <button className="btn secondary" onClick={() => browseQuery.refetch()}>Refresh</button>
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
              <option value="NOT_AVAILABLE">NOT_AVAILABLE</option>
              <option value="BOOKED">BOOKED</option>
            </select>
            <input placeholder="Language" value={filters.lang} onChange={(e) => setFilters({ ...filters, lang: e.target.value })} />
          </div>
          <p className="muted section-note">Note: `AVAILABLE` profiles are usually shown first in browse results.</p>
          <button className="btn" onClick={onApplyFilters}>Apply Filters</button>

          {browseQuery.isLoading && <p className="muted">Loading profiles...</p>}
          {displayedMaids.length === 0 && !browseQuery.isLoading && routedMaidId === null && <p className="muted">No profiles match your filters.</p>}
          {displayedMaids.length === 0 && !browseQuery.isLoading && routedMaidId !== null && <p className="muted">This profile could not be found.</p>}

          <div className="maids-grid">
            {displayedMaids.map((maid) => (
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
                  <p className="muted meta-row">{formatRelativeDate(maid.last_updated_at || maid.UpdatedAt)}</p>
                  <p className="muted meta-row">Agency: {maid.agency_verified ? 'Verified' : 'Pending verification'}</p>
                  <span className="status-pill">{maid.availability_status}</span>

                  {(() => {
                    const contactNumber = maid.agency_whatsapp || maid.agency_phone
                    const contactUrl = contactNumber
                      ? buildWhatsAppUrlFromPhone(contactNumber, buildMaidDiscussionMessage(maid))
                      : maid.agency_whatsapp_url || ''
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
                          <a
                            className="icon-btn"
                            href={contactUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Contact agency on WhatsApp for ${maid.name}`}
                            title="Contact on WhatsApp"
                            onClick={(event) => {
                              event.stopPropagation()
                              recordContactedAgency(maid)
                            }}
                          >
                            <WhatsAppIcon />
                          </a>
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
                          href={`${apiBase.replace(/\/api\/?$/, '')}/public/maids/${maid.ID}`}
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

          {routedMaidId !== null && displayedMaids[0] && (
            <section className="maid-detail-panel" aria-label="Maid actual details">
              <h3>Actual Maid Data</h3>
              <div className="maid-detail-grid">
                <p><strong>ID:</strong> {displayedMaids[0].ID}</p>
                <p><strong>Name:</strong> {displayedMaids[0].name}</p>
                <p><strong>Age:</strong> {displayedMaids[0].age}</p>
                <p><strong>Experience:</strong> {displayedMaids[0].experience_years} years</p>
                <p><strong>Languages:</strong> {displayedMaids[0].languages || '-'}</p>
                <p><strong>Expected salary:</strong> {displayedMaids[0].expected_salary || '-'}</p>
                <p><strong>Availability:</strong> {displayedMaids[0].availability_status}</p>
                <p><strong>Agency verified:</strong> {displayedMaids[0].agency_verified ? 'Yes' : 'No'}</p>
                <p><strong>Agency phone:</strong> {displayedMaids[0].agency_phone || '-'}</p>
                <p><strong>Last updated:</strong> {displayedMaids[0].last_updated_at || displayedMaids[0].UpdatedAt || '-'}</p>
              </div>
            </section>
          )}
        </section>
      )}

      {showAgencyView && (
        <>
          <section className="grid three role-grid">
            <article className="card elevated role-panel">
              <h3>Listing Health Score</h3>
              <h2 className="role-score">{agencyAvgHealth}%</h2>
              <p className="muted">Average completeness across your profiles.</p>
            </article>
            <article className="card elevated role-panel">
              <h3>Missing Fields</h3>
              <h2 className="role-score">{agencyMissingCoverage}</h2>
              <p className="muted">Profiles still missing salary, media, language, or open availability.</p>
            </article>
            <article className="card elevated role-panel">
              <h3>Profile Performance</h3>
              <h2 className="role-score">{agencyProfilesWithMedia}/{agencyMaids.length}</h2>
              <p className="muted">Profiles with photo uploaded (stronger conversion signal).</p>
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

          <section className="grid two">
            <form onSubmit={createMaid} className="card elevated" id="agency-create-section">
            <h2>Create Maid Profile</h2>
            <p className="muted">Upload real photo and optional intro video file (not URL).</p>
            <label htmlFor="maid-name">Name</label>
            <input id="maid-name" placeholder="Name" required value={maidForm.name} onChange={(e) => setMaidForm({ ...maidForm, name: e.target.value })} />
            <label htmlFor="maid-age">Age</label>
            <input id="maid-age" placeholder="Age" required min={18} type="number" value={maidForm.age} onChange={(e) => setMaidForm({ ...maidForm, age: e.target.value })} />
            <label htmlFor="maid-exp">Experience</label>
            <select id="maid-exp" value={maidForm.experience_years} onChange={(e) => setMaidForm({ ...maidForm, experience_years: Number(e.target.value) })}>
              {EXPERIENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <label htmlFor="maid-salary">Expected Salary</label>
            <input id="maid-salary" placeholder="Expected salary (e.g. 2500 SAR / month)" value={maidForm.expected_salary} onChange={(e) => setMaidForm({ ...maidForm, expected_salary: e.target.value })} />
            <label htmlFor="maid-languages">Languages</label>
            <input id="maid-languages" placeholder="Languages (comma-separated)" value={maidForm.languages} onChange={(e) => setMaidForm({ ...maidForm, languages: e.target.value })} />
            <label htmlFor="maid-availability">Availability</label>
            <select id="maid-availability" value={maidForm.availability_status} onChange={(e) => setMaidForm({ ...maidForm, availability_status: e.target.value })}>
              <option value="AVAILABLE">AVAILABLE</option>
              <option value="NOT_AVAILABLE">NOT_AVAILABLE</option>
              <option value="BOOKED">BOOKED</option>
            </select>
            <p className="muted section-note">Note: choose `AVAILABLE` to make this profile easier to discover.</p>
            <label className="file-label">Photo
              <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
            </label>
            <label className="file-label">Intro Video (Optional)
              <input type="file" accept="video/*" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
            </label>
            <button className="btn" type="submit">Create Profile</button>
            </form>

            <div className="card full">
            <div className="section-head">
              <h2>My Profiles</h2>
              <button className="btn secondary" onClick={() => myMaidsQuery.refetch()}>Refresh</button>
            </div>
            {myMaidsQuery.isLoading && <p className="muted">Loading agency profiles...</p>}
            <ul className="list-clean">
              {(myMaidsQuery.data || []).map((maid) => (
                <li key={maid.ID}>
                  {editingMaidId === maid.ID ? (
                    <div className="maid-edit-grid">
                      <input placeholder="Name" value={editMaidForm.name} onChange={(e) => setEditMaidForm({ ...editMaidForm, name: e.target.value })} />
                      <input placeholder="Age" type="number" min={18} value={editMaidForm.age} onChange={(e) => setEditMaidForm({ ...editMaidForm, age: e.target.value })} />
                      <select value={editMaidForm.experience_years} onChange={(e) => setEditMaidForm({ ...editMaidForm, experience_years: Number(e.target.value) })}>
                        {EXPERIENCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <input placeholder="Expected salary" value={editMaidForm.expected_salary} onChange={(e) => setEditMaidForm({ ...editMaidForm, expected_salary: e.target.value })} />
                      <input placeholder="Languages" value={editMaidForm.languages} onChange={(e) => setEditMaidForm({ ...editMaidForm, languages: e.target.value })} />
                      <select value={editMaidForm.availability_status} onChange={(e) => setEditMaidForm({ ...editMaidForm, availability_status: e.target.value })}>
                        <option value="AVAILABLE">AVAILABLE</option>
                        <option value="NOT_AVAILABLE">NOT_AVAILABLE</option>
                        <option value="BOOKED">BOOKED</option>
                      </select>
                      <div className="maid-edit-actions">
                        <button className="btn" type="button" onClick={() => updateMaid(maid.ID)}>Save</button>
                        <button className="btn secondary" type="button" onClick={cancelEditMaid}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span>{maid.name} • {maid.availability_status}</span>
                      <div className="crud-actions">
                        <button className="btn secondary" type="button" onClick={() => startEditMaid(maid)}>Edit</button>
                        <button className="btn danger" type="button" onClick={() => deleteMaid(maid.ID)}>Delete</button>
                        <button
                          className="icon-btn secondary"
                          aria-label={`Share ${maid.name} profile`}
                          title="Share profile"
                          onClick={() => shareMaidProfile(maid)}
                          type="button"
                        >
                          <ShareIcon />
                        </button>
                        <button className="btn secondary" type="button" onClick={() => copyProfileLink(maid.ID)}>Copy Link</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>

            <hr />
            <h3>Agency WhatsApp Contact</h3>
            <p className="muted">This number appears to employers so they can chat with your agency directly.</p>
            <form onSubmit={updateAgencyContact}>
              <label htmlFor="agency-whatsapp">WhatsApp number</label>
              <input
                id="agency-whatsapp"
                placeholder="WhatsApp number (e.g. +251911223344)"
                value={agencyWhatsappPhone}
                onChange={(e) => setAgencyWhatsappPhoneDraft(e.target.value)}
              />
              <button className="btn" type="submit">Save WhatsApp Number</button>
              {isSavingContact && <p className="muted">Saving contact...</p>}
            </form>
            {agencyContactQuery.data?.whatsapp_url && (
              <a className="btn secondary" href={agencyContactQuery.data.whatsapp_url} target="_blank" rel="noreferrer">Open My WhatsApp Link</a>
            )}
            </div>
          </section>
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
            <button
              className="btn secondary"
              onClick={() => {
                subscriptionsQuery.refetch()
                pendingAgenciesQuery.refetch()
                activatedAgenciesQuery.refetch()
                visitStatsQuery.refetch()
              }}
            >
              {subscriptionsQuery.isFetching || pendingAgenciesQuery.isFetching || activatedAgenciesQuery.isFetching || visitStatsQuery.isFetching ? 'Refreshing...' : 'Refresh Analytics'}
            </button>
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
              <p className="muted">No activated agencies yet.</p>
            )}

            {activatedAgencies.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Agency ID</th>
                      <th>Email</th>
                      <th>Moderation</th>
                      <th>Status</th>
                      <th>Maid Profiles</th>
                      <th>Last Login</th>
                      <th>Controls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activatedAgencies.slice(0, 20).map((agency) => (
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
          </article>

          <article className="card elevated admin-table-panel">
            <div className="section-head">
              <h3>Pending Agency Registrations</h3>
              <button className="btn secondary" onClick={() => pendingAgenciesQuery.refetch()}>Refresh Table</button>
            </div>

            {pendingAgenciesQuery.isLoading && <p className="muted">Loading pending agencies...</p>}
            {!pendingAgenciesQuery.isLoading && pendingAgencies.length === 0 && (
              <p className="muted">No pending agency registrations.</p>
            )}

            {pendingAgencies.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Agency ID</th>
                      <th>Email</th>
                      <th>Country</th>
                      <th>Phone</th>
                      <th>Registered</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAgencies.slice(0, 20).map((agency) => (
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
          </article>

          <article className="card elevated admin-table-panel">
            <div className="section-head">
              <h3>Recent Subscription Requests</h3>
              <button className="btn secondary" onClick={() => subscriptionsQuery.refetch()}>Refresh Table</button>
            </div>

            {subscriptionsQuery.isLoading && <p className="muted">Loading subscription requests...</p>}
            {!subscriptionsQuery.isLoading && adminSubscriptions.length === 0 && (
              <p className="muted">No subscription requests yet.</p>
            )}

            {adminSubscriptions.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Agency</th>
                      <th>Plan</th>
                      <th>Months</th>
                      <th>Status</th>
                      <th>Transaction Ref</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminSubscriptions.slice(0, 12).map((sub) => {
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
          </article>

          <article className="card elevated admin-table-panel">
            <div className="section-head">
              <h3>Top Employer Visits</h3>
              <button className="btn secondary" onClick={() => visitStatsQuery.refetch()}>Refresh Visits</button>
            </div>

            {visitStatsQuery.isLoading && <p className="muted">Loading visit metrics...</p>}
            {!visitStatsQuery.isLoading && topEmployers.length === 0 && (
              <p className="muted">No employer visits tracked yet.</p>
            )}

            {topEmployers.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Employer ID</th>
                      <th>Email</th>
                      <th>Visit Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topEmployers.map((entry) => (
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
    </main>
  )
}
