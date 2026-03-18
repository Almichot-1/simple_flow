import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../../../shared/api/client'
import { buildWhatsAppDirectUrl, formatRelativeDate, mediaUrl } from '../../../shared/lib/helpers'

function PublicProfileCard({ maid }) {
  const [pendingContactOpen, setPendingContactOpen] = useState(false)
  const profileLink = `${window.location.origin}/maids/${maid.id}`
  const whatsappMessage = `Hello, I am interested in ${maid.name} profile. Profile link: ${profileLink}`
  const whatsappUrl = buildWhatsAppDirectUrl({
    whatsAppUrl: maid.agency_whatsapp_url,
    message: whatsappMessage,
  })

  return (
    <main className="public-profile-page" aria-label="Public maid profile">
      <div className="public-profile-shell">
        <span className="public-badge">Verified showcase profile</span>
        <article className="public-card">
          <div className="public-media-wrap">
            {maid.photo_url ? (
              <img className="public-media" src={mediaUrl(maid.photo_url)} alt={`${maid.name} profile`} />
            ) : (
              <div className="public-media-placeholder">Profile Photo Coming Soon</div>
            )}
          </div>
          <div className="public-content">
            <h1>{maid.name}</h1>
            <p className="public-subtitle">Trusted domestic worker profile curated for fast employer review.</p>
            <ul className="public-meta-grid">
              <li><span>Age</span><strong>{maid.age} years</strong></li>
              <li><span>Experience</span><strong>{maid.experience_years} years</strong></li>
              <li><span>Languages</span><strong>{maid.languages || 'N/A'}</strong></li>
              <li><span>Expected Salary</span><strong>{maid.expected_salary || 'Negotiable'}</strong></li>
            </ul>
            <div className="public-bottom-row">
              <span className="public-status">{maid.availability_status}</span>
              <span className="public-updated">{formatRelativeDate(maid.last_updated_at)}</span>
            </div>
            {whatsappUrl && (
              <button className="public-cta" type="button" onClick={() => setPendingContactOpen(true)}>
                Contact Agency on WhatsApp
              </button>
            )}
          </div>
        </article>
      </div>

      {pendingContactOpen && whatsappUrl && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm agency contact action">
          <div className="modal-card">
            <h3>Contact Agency</h3>
            <p>
              You are about to contact this agency on WhatsApp about <strong>{maid.name}</strong>.
            </p>
            <div className="modal-actions">
              <button className="btn secondary" type="button" onClick={() => setPendingContactOpen(false)}>Cancel</button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
                  setPendingContactOpen(false)
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default function PublicMaidRedirectPage() {
  const { maidId } = useParams()

  const maidQuery = useQuery({
    queryKey: ['public-maid-profile', maidId],
    queryFn: () => apiRequest(`/public/maids/${maidId}`),
    enabled: Boolean(maidId && /^\d+$/.test(maidId)),
    retry: false,
  })

  if (!maidId || !/^\d+$/.test(maidId)) {
    return <Navigate to="/login" replace />
  }

  if (maidQuery.isLoading) {
    return (
      <main className="public-profile-page">
        <div className="public-profile-shell">
          <p className="muted">Loading profile...</p>
        </div>
      </main>
    )
  }

  if (maidQuery.isError || !maidQuery.data) {
    return (
      <main className="public-profile-page">
        <div className="public-profile-shell">
          <article className="card elevated">
            <h2>Profile unavailable</h2>
            <p className="muted">This shared profile may have been removed or the link is invalid.</p>
          </article>
        </div>
      </main>
    )
  }

  return <PublicProfileCard maid={maidQuery.data} />
}
