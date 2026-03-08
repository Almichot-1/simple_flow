import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { signInWithEmailFirebase, signInWithGoogleFirebase } from '../../../shared/lib/firebase'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const maidPromptId = new URLSearchParams(location.search).get('maid')

  async function onSubmit(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    try {
      await login(form)
      setMessage('Logged in successfully.')
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    }
  }

  async function onContinueWithGoogle() {
    setMessage('')
    setError('')
    try {
      const credential = await signInWithGoogleFirebase()
      setMessage(`Firebase Google sign-in successful for ${credential.user.email}.`)
    } catch (err) {
      setError(err.message || 'Google sign-in failed.')
    }
  }

  async function onContinueWithEmailFirebase() {
    setMessage('')
    setError('')
    try {
      const credential = await signInWithEmailFirebase(form.email, form.password)
      setMessage(`Firebase email sign-in successful for ${credential.user.email}.`)
    } catch (err) {
      setError(err.message || 'Firebase email sign-in failed.')
    }
  }

  return (
    <main className="app auth-page">
      <header className="hero">
        <h1>Domestic Worker Showcase</h1>
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
            <input
              id="login-password"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <button className="btn" type="submit">Login</button>
          </form>

          <div className="auth-divider"><span>or</span></div>
          <div className="auth-provider-buttons">
            <button className="btn secondary" type="button" onClick={onContinueWithGoogle}>Continue with Google</button>
            <button className="btn secondary" type="button" onClick={onContinueWithEmailFirebase}>Continue with Email (Firebase)</button>
          </div>
          <p className="muted auth-switch">No account yet? <Link to="/register">Create one</Link></p>
        </article>
      </section>
    </main>
  )
}
