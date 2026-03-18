import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { apiRequest } from '../../../shared/api/client'
import { publishAgencyRegistrationNotification } from '../../../shared/lib/firebase'
import brandLogo from '../../../assets/simflow-logo.svg'

function validateRegistrationForm(form, isStrongPassword) {
  const errors = {}
  const email = String(form.email || '').trim()
  const password = String(form.password || '')
  const country = String(form.country || '').trim()
  const phone = String(form.phone || '').trim()

  if (!email) {
    errors.email = 'Email is required.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Please enter a valid email address.'
  }

  if (!password) {
    errors.password = 'Password is required.'
  } else if (!isStrongPassword) {
    errors.password = 'Password must be at least 10 characters and include uppercase, lowercase, number, and symbol.'
  }

  if (form.role === 'AGENCY') {
    if (!country) errors.country = 'Country is required for agency accounts.'
    if (!phone) errors.phone = 'Phone is required for agency accounts.'
  }

  return errors
}

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
  const [fieldErrors, setFieldErrors] = useState({})
  const [didSubmit, setDidSubmit] = useState(false)

  const isStrongPassword =
    form.password.length >= 10 &&
    /[A-Z]/.test(form.password) &&
    /[a-z]/.test(form.password) &&
    /\d/.test(form.password) &&
    /[^A-Za-z0-9]/.test(form.password)

  useEffect(() => {
    if (!message && !error) return undefined
    const timeoutId = window.setTimeout(() => {
      setMessage('')
      setError('')
    }, 2600)
    return () => window.clearTimeout(timeoutId)
  }, [message, error])

  async function onSubmit(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setRegisterStatus(null)
    setDidSubmit(true)

    const nextErrors = validateRegistrationForm(form, isStrongPassword)
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setIsSubmitting(true)
    try {
      const payload = { ...form }
      if (payload.role !== 'AGENCY') {
        payload.country = ''
        payload.phone = ''
      }
      await apiRequest('/register', { method: 'POST', body: payload })
      setFieldErrors({})
      setDidSubmit(false)

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

          <form onSubmit={onSubmit} noValidate>
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              className={fieldErrors.email ? 'input-invalid' : ''}
              placeholder="Email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => {
                const nextForm = { ...form, email: e.target.value }
                setForm(nextForm)
                if (didSubmit) {
                  setFieldErrors(validateRegistrationForm(nextForm, isStrongPassword))
                }
              }}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
            />
            {fieldErrors.email && <p id="register-email-error" className="field-error">{fieldErrors.email}</p>}
            <label htmlFor="register-password">Password</label>
            <div className="password-row">
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                className={fieldErrors.password ? 'input-invalid' : ''}
                placeholder="Password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => {
                  const nextForm = { ...form, password: e.target.value }
                  setForm(nextForm)
                  if (didSubmit) {
                    const nextStrong =
                      nextForm.password.length >= 10 &&
                      /[A-Z]/.test(nextForm.password) &&
                      /[a-z]/.test(nextForm.password) &&
                      /\d/.test(nextForm.password) &&
                      /[^A-Za-z0-9]/.test(nextForm.password)
                    setFieldErrors(validateRegistrationForm(nextForm, nextStrong))
                  }
                }}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'register-password-error' : undefined}
              />
              <button className="btn secondary password-toggle" type="button" onClick={() => setShowPassword((prev) => !prev)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {fieldErrors.password && <p id="register-password-error" className="field-error">{fieldErrors.password}</p>}
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
                  className={fieldErrors.country ? 'input-invalid' : ''}
                  placeholder="Country"
                  value={form.country}
                  onChange={(e) => {
                    const nextForm = { ...form, country: e.target.value }
                    setForm(nextForm)
                    if (didSubmit) {
                      setFieldErrors(validateRegistrationForm(nextForm, isStrongPassword))
                    }
                  }}
                  aria-invalid={Boolean(fieldErrors.country)}
                  aria-describedby={fieldErrors.country ? 'register-country-error' : undefined}
                />
                {fieldErrors.country && <p id="register-country-error" className="field-error">{fieldErrors.country}</p>}
                <label htmlFor="register-phone">Phone</label>
                <input
                  id="register-phone"
                  className={fieldErrors.phone ? 'input-invalid' : ''}
                  placeholder="Phone"
                  value={form.phone}
                  onChange={(e) => {
                    const nextForm = { ...form, phone: e.target.value }
                    setForm(nextForm)
                    if (didSubmit) {
                      setFieldErrors(validateRegistrationForm(nextForm, isStrongPassword))
                    }
                  }}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  aria-describedby={fieldErrors.phone ? 'register-phone-error' : undefined}
                />
                {fieldErrors.phone && <p id="register-phone-error" className="field-error">{fieldErrors.phone}</p>}
              </>
            )}
            <button className="btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account...' : 'Register'}
            </button>
          </form>

          <p className="muted auth-switch">Already have an account? <Link to="/login">Go to login</Link></p>
        </article>
      </section>
    </main>
  )
}
