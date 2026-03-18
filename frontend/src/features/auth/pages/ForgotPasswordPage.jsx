import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiRequest } from '../../../shared/api/client'
import brandLogo from '../../../assets/simflow-logo.svg'

function validateRecoveryRequestEmail(email) {
  const errors = {}
  const value = String(email || '').trim()

  if (!value) {
    errors.email = 'Email is required.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    errors.email = 'Please enter a valid email address.'
  }

  return errors
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [generatedCode, setGeneratedCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isRequesting, setIsRequesting] = useState(false)
  const [requestErrors, setRequestErrors] = useState({})
  const [didSubmitRequest, setDidSubmitRequest] = useState(false)

  useEffect(() => {
    if (!message && !error) return undefined
    const timeoutId = window.setTimeout(() => {
      setMessage('')
      setError('')
    }, 2600)
    return () => window.clearTimeout(timeoutId)
  }, [message, error])

  async function onRequestRecoveryCode(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setGeneratedCode('')
    setDidSubmitRequest(true)

    const nextErrors = validateRecoveryRequestEmail(email)
    setRequestErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setIsRequesting(true)
    try {
      const data = await apiRequest('/forgot-password', {
        method: 'POST',
        body: { email: String(email || '').trim().toLowerCase() },
      })

      const normalizedEmail = String(email || '').trim().toLowerCase()
      const code = String(data?.recovery_code || '').trim()

      if (!/^\d{6}$/.test(code)) {
        setError('No one-time code was returned for this email. Please try again or request a new code.')
        return
      }

      setDidSubmitRequest(false)
      setRequestErrors({})
      setGeneratedCode(code)
      setMessage(`Your one-time code is ${code}. Save it and continue to reset.`)

      const query = new URLSearchParams({ email: normalizedEmail, code }).toString()

      navigate(`/reset-with-code?${query}`, {
        replace: true,
        state: {
          email: normalizedEmail,
          recoveryCode: code,
          message: 'One-time code generated. Enter it to reset your password.',
        },
      })
    } catch (err) {
      setError(err.message || 'Unable to start password reset.')
    } finally {
      setIsRequesting(false)
    }
  }

  return (
    <main className="app auth-page">
      <header className="hero">
        <div className="brand-row">
          <img className="brand-logo" src={brandLogo} alt="SimFlow logo" />
          <div>
            <p className="brand-kicker">SimFlow</p>
            <h1>Account Recovery</h1>
          </div>
        </div>
        <p>Step 1: request your one-time code. Step 2: use the code on the next page to set a new password.</p>
      </header>

      <section className="grid two auth-grid">
        <article className="card elevated auth-card">
          <h2>Forgot Password</h2>
          {message && <p className="banner ok" role="status" aria-live="polite">{message}</p>}
          {error && <p className="banner err" role="alert" aria-live="assertive">{error}</p>}

          <form onSubmit={onRequestRecoveryCode} noValidate>
            <label htmlFor="recover-email">Email</label>
            <input
              id="recover-email"
              type="email"
              className={requestErrors.email ? 'input-invalid' : ''}
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                const value = event.target.value
                setEmail(value)
                if (didSubmitRequest) {
                  setRequestErrors(validateRecoveryRequestEmail(value))
                }
              }}
              aria-invalid={Boolean(requestErrors.email)}
              aria-describedby={requestErrors.email ? 'recover-email-error' : undefined}
            />
            {requestErrors.email && <p id="recover-email-error" className="field-error">{requestErrors.email}</p>}
            <button className="btn" type="submit" disabled={isRequesting}>
              {isRequesting ? 'Generating one-time code...' : 'Send One-Time Code'}
            </button>
          </form>

          {generatedCode && (
            <article className="card timeline-card" aria-label="Generated one-time code">
              <h3>One-Time Code</h3>
              <p><strong>{generatedCode}</strong></p>
              <p className="muted">Use this 6-digit code on the reset page.</p>
            </article>
          )}

          <p className="muted">Already have a code? <Link to="/reset-with-code">Go to reset page</Link></p>

          <p className="muted auth-switch">Remembered your password? <Link to="/login">Back to login</Link></p>
        </article>
      </section>
    </main>
  )
}
