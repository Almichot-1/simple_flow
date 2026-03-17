import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  confirmPasswordResetFirebase,
  sendPasswordResetEmailFirebase,
  verifyPasswordResetCodeFirebase,
} from '../../../shared/lib/firebase'
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

function validateResetForm({ newPassword, confirmPassword, isStrongPassword, passwordsMatch }) {
  const errors = {}

  if (!String(newPassword || '')) {
    errors.newPassword = 'New password is required.'
  } else if (!isStrongPassword) {
    errors.newPassword = 'Password must be at least 10 characters and include uppercase, lowercase, number, and symbol.'
  }

  if (!String(confirmPassword || '')) {
    errors.confirmPassword = 'Confirm password is required.'
  } else if (!passwordsMatch) {
    errors.confirmPassword = 'Passwords do not match.'
  }

  return errors
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isRequesting, setIsRequesting] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)
  const [requestErrors, setRequestErrors] = useState({})
  const [resetErrors, setResetErrors] = useState({})
  const [didSubmitRequest, setDidSubmitRequest] = useState(false)
  const [didSubmitReset, setDidSubmitReset] = useState(false)

  const resetCode = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const mode = params.get('mode')
    const oobCode = params.get('oobCode')
    if (mode !== 'resetPassword') return ''
    return String(oobCode || '').trim()
  }, [location.search])

  const isStrongPassword =
    newPassword.length >= 10 &&
    /[A-Z]/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /\d/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword)

  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword

  async function onRequestRecoveryCode(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setDidSubmitRequest(true)

    const nextErrors = validateRecoveryRequestEmail(email)
    setRequestErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setIsRequesting(true)
    try {
      await sendPasswordResetEmailFirebase(email)
      setDidSubmitRequest(false)
      setRequestErrors({})
      setMessage('Reset link sent. Please check your email and open the link to continue.')
    } catch (err) {
      setError(err.message || 'Unable to start password reset.')
    } finally {
      setIsRequesting(false)
    }
  }

  async function onResetPassword(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setDidSubmitReset(true)

    const nextErrors = validateResetForm({ newPassword, confirmPassword, isStrongPassword, passwordsMatch })
    setResetErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setIsResetting(true)
    try {
      await confirmPasswordResetFirebase(resetCode, newPassword)
      setDidSubmitReset(false)
      setResetErrors({})

      navigate('/login', {
        replace: true,
        state: { message: 'Password reset successful. Please login with your new password.' },
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setIsResetting(false)
    }
  }

  useEffect(() => {
    if (!resetCode) return

    let active = true
    setIsVerifyingCode(true)
    setError('')
    setMessage('')

    verifyPasswordResetCodeFirebase(resetCode)
      .then((resolvedEmail) => {
        if (!active) return
        setEmail(String(resolvedEmail || '').trim().toLowerCase())
        setRequestErrors({})
        setDidSubmitRequest(false)
        setMessage('Reset link verified. Set your new password below.')
      })
      .catch((err) => {
        if (!active) return
        setError(err.message || 'This reset link is invalid or expired. Please request a new one.')
      })
      .finally(() => {
        if (!active) return
        setIsVerifyingCode(false)
      })

    return () => {
      active = false
    }
  }, [resetCode])

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
        <p>Recover your account with a secure Firebase reset link sent to your email.</p>
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
              disabled={Boolean(resetCode)}
              aria-invalid={Boolean(requestErrors.email)}
              aria-describedby={requestErrors.email ? 'recover-email-error' : undefined}
            />
            {requestErrors.email && <p id="recover-email-error" className="field-error">{requestErrors.email}</p>}
            <button className="btn" type="submit" disabled={isRequesting || isResetting}>
              {isRequesting ? 'Sending reset link...' : 'Send Reset Link'}
            </button>
          </form>

          {resetCode && (
            <form onSubmit={onResetPassword} noValidate>
              <label htmlFor="recover-email-verified">Account Email</label>
              <input
                id="recover-email-verified"
                type="email"
                value={email}
                readOnly
                disabled
              />

              <label htmlFor="recover-new-password">New Password</label>
              <div className="password-row">
                <input
                  id="recover-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  className={resetErrors.newPassword ? 'input-invalid' : ''}
                  placeholder="New password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => {
                    const value = event.target.value
                    setNewPassword(value)
                    if (didSubmitReset) {
                      setResetErrors(validateResetForm({
                        newPassword: value,
                        confirmPassword,
                        isStrongPassword:
                          value.length >= 10 &&
                          /[A-Z]/.test(value) &&
                          /[a-z]/.test(value) &&
                          /\d/.test(value) &&
                          /[^A-Za-z0-9]/.test(value),
                        passwordsMatch: value && confirmPassword && value === confirmPassword,
                      }))
                    }
                  }}
                  aria-invalid={Boolean(resetErrors.newPassword)}
                  aria-describedby={resetErrors.newPassword ? 'recover-new-password-error' : undefined}
                />
                <button className="btn secondary password-toggle" type="button" onClick={() => setShowNewPassword((prev) => !prev)}>
                  {showNewPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {resetErrors.newPassword && <p id="recover-new-password-error" className="field-error">{resetErrors.newPassword}</p>}

              <label htmlFor="recover-confirm-password">Confirm Password</label>
              <div className="password-row">
                <input
                  id="recover-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className={resetErrors.confirmPassword ? 'input-invalid' : ''}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => {
                    const value = event.target.value
                    setConfirmPassword(value)
                    if (didSubmitReset) {
                      setResetErrors(validateResetForm({
                        newPassword,
                        confirmPassword: value,
                        isStrongPassword,
                        passwordsMatch: newPassword && value && newPassword === value,
                      }))
                    }
                  }}
                  aria-invalid={Boolean(resetErrors.confirmPassword)}
                  aria-describedby={resetErrors.confirmPassword ? 'recover-confirm-password-error' : undefined}
                />
                <button className="btn secondary password-toggle" type="button" onClick={() => setShowConfirmPassword((prev) => !prev)}>
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {resetErrors.confirmPassword && <p id="recover-confirm-password-error" className="field-error">{resetErrors.confirmPassword}</p>}

              <p className={`muted ${isStrongPassword ? 'ok' : ''}`}>
                Password must be at least 10 characters and include uppercase, lowercase, number, and symbol.
              </p>

              <button
                className="btn"
                type="submit"
                disabled={isRequesting || isResetting || isVerifyingCode}
              >
                {isResetting ? 'Resetting password...' : isVerifyingCode ? 'Verifying link...' : 'Reset Password'}
              </button>
            </form>
          )}

          <p className="muted auth-switch">Remembered your password? <Link to="/login">Back to login</Link></p>
        </article>
      </section>
    </main>
  )
}
