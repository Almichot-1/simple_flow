import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { apiRequest } from '../../../shared/api/client'
import { publishAgencyRegistrationNotification } from '../../../shared/lib/firebase'
import brandLogo from '../../../assets/simflow-logo.svg'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: '',
    password: '',
    role: 'AGENCY',
    country: 'Ethiopia',
    phone: '',
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [registerStatus, setRegisterStatus] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isStrongPassword =
    form.password.length >= 10 &&
    /[A-Z]/.test(form.password) &&
    /[a-z]/.test(form.password) &&
    /\d/.test(form.password) &&
    /[^A-Za-z0-9]/.test(form.password)

  async function onSubmit(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setRegisterStatus(null)
    setIsSubmitting(true)
    try {
      const payload = { ...form }
      if (payload.role !== 'AGENCY') {
        payload.country = ''
        payload.phone = ''
      }
      await apiRequest('/register', { method: 'POST', body: payload })

      if (payload.role === 'AGENCY') {
        await publishAgencyRegistrationNotification({
          agencyEmail: payload.email,
          country: payload.country,
          phone: payload.phone,
          source: 'web-register',
        }).catch(() => {
          // Keep registration successful even if notifications are not writable.
        })

        navigate('/login', {
          replace: true,
          state: {
            message: 'Registration successful. Your agency is in review and can login after admin approval.',
          },
        })
      } else {
        navigate('/login', {
          replace: true,
          state: { message: 'Registration successful. Please login.' },
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
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
        <p>Employers can login immediately. Agency accounts require admin approval.</p>
      </header>
      <section className="grid two auth-grid">
        <article className="card elevated auth-card">
          <h2>Create Account</h2>
          {message && <p className="banner ok" role="status" aria-live="polite">{message}</p>}
          {error && <p className="banner err" role="alert" aria-live="assertive">{error}</p>}

          {registerStatus && (
            <section className="card timeline-card" aria-label="Agency registration timeline">
              <h3>What Happens Next</h3>
              <ol className="timeline-list">
                {registerStatus.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="muted">Expected approval: usually within 24-48 hours.</p>
            </section>
          )}

          <form onSubmit={onSubmit}>
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <label htmlFor="register-password">Password</label>
            <div className="password-row">
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                autoComplete="new-password"
                minLength={10}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button className="btn secondary password-toggle" type="button" onClick={() => setShowPassword((prev) => !prev)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className={`muted ${isStrongPassword ? 'ok' : ''}`}>
              Password must be at least 10 characters and include uppercase, lowercase, number, and symbol.
            </p>
            <label htmlFor="register-role">Account type</label>
            <select id="register-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="AGENCY">Agency</option>
              <option value="EMPLOYER">Employer</option>
            </select>

            {form.role === 'AGENCY' && (
              <>
                <label htmlFor="register-country">Country</label>
                <input
                  id="register-country"
                  placeholder="Country"
                  required
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                />
                <label htmlFor="register-phone">Phone</label>
                <input
                  id="register-phone"
                  placeholder="Phone"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </>
            )}
            <button className="btn" type="submit" disabled={isSubmitting || !isStrongPassword}>
              {isSubmitting ? 'Creating account...' : 'Register'}
            </button>
          </form>

          <p className="muted auth-switch">Already have an account? <Link to="/login">Go to login</Link></p>
        </article>
      </section>
    </main>
  )
}
