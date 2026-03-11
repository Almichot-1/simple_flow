import { Navigate, useParams } from 'react-router-dom'
import { apiOrigin } from '../../../shared/api/client'

export default function PublicMaidRedirectPage() {
  const { maidId } = useParams()

  if (!maidId || !/^\d+$/.test(maidId)) {
    return <Navigate to="/login" replace />
  }

  // Redirect legacy shared frontend links to the backend public profile endpoint.
  window.location.replace(`${apiOrigin}/public/maids/${maidId}`)
  return null
}
