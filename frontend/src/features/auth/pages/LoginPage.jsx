import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { getFirebaseRuntimeSummary, signInWithGoogleFirebase } from '../../../shared/lib/firebase'
import brandLogo from '../../../assets/simflow-logo.svg'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, loginWithFirebase } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false)

  const maidPromptId = new URLSearchParams(location.search).get('maid')

  useEffect(() => {
    if (location.state?.message) {
      setMessage(location.state.message)
      navigate(location.pathname + location.search, { replace: true, state: null })
    }
  }, [location.pathname, location.search, location.state, navigate])

  async function onSubmit(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setIsSubmitting(true)
    try {
      await login(form)
      setMessage('Logged in successfully.')
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function onContinueWithGoogle() {
    setMessage('')
    setError('')
    setIsGoogleSubmitting(true)
    try {
      const credential = await signInWithGoogleFirebase()
      const idToken = await credential.user.getIdToken()
      await loginWithFirebase(idToken)
      setMessage(`Google sign-in successful for ${credential.user.email}.`)
      navigate('/dashboard')
    } catch (err) {
      if (err?.code === 'auth/unauthorized-domain') {
        const runtime = getFirebaseRuntimeSummary()
        setError(
          `Google sign-in blocked for domain: ${window.location.hostname}. Runtime config => projectId=${runtime.projectId}, authDomain=${runtime.authDomain}, apiKey=${runtime.apiKeyMasked}. Add this domain in Firebase Auth -> Authorized domains for that exact project.`,
        )
        return
      }
      setError(err.message || 'Google sign-in failed.')
    } finally {
      setIsGoogleSubmitting(false)
    }
  }

  return (
    <main className="app auth-page">
      <header className="hero">
        <div className="brand-row">
          <img className="brand-logo" src={brandLogo} alt="SimFlow logo" />
          <div>
            <p className="brand-kicker">SimFlow</p>
            <h1>Domestic Worker Showcase</h1>
          </div>
        </div>
        <p>Login to browse profiles, manage agency listings, or approve requests.</p>
      </header>
      <section className="grid two auth-grid">
        <article className="card elevated auth-card">
          <h2>Login</h2>
          {message && <p className="banner ok" role="status" aria-live="polite">{message}</p>}
          {error && <p className="banner err" role="alert" aria-live="assertive">{error}</p>}
          {maidPromptId && (
            <div className="card">
              <h3>Profile Link Opened</h3>
              <p className="muted">Please login to continue to maid profile #{maidPromptId}.</p>
            </div>
          )}
          <form onSubmit={onSubmit}>
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <label htmlFor="login-password">Password</label>
            <div className="password-row">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button className="btn secondary password-toggle" type="button" onClick={() => setShowPassword((prev) => !prev)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <button className="btn" type="submit" disabled={isSubmitting || isGoogleSubmitting}>
              {isSubmitting ? 'Logging in...' : 'Login'}
            </button>
          </form>
          <p className="muted auth-forgot-link"><Link to="/forgot-password">Forgot password?</Link></p>

          <div className="auth-divider"><span>or</span></div>
          <div className="auth-provider-buttons">
            <button className="btn secondary" type="button" onClick={onContinueWithGoogle} disabled={isSubmitting || isGoogleSubmitting}>
              {isGoogleSubmitting ? 'Connecting to Google...' : 'Continue with Google'}
            </button>
          </div>
          <p className="muted auth-switch">No account yet? <Link to="/register">Create one</Link></p>
        </article>
      </section>
    </main>
  )
}
