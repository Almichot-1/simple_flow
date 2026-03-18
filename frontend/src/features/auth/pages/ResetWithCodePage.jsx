import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiRequest } from '../../../shared/api/client'
import brandLogo from '../../../assets/simflow-logo.svg'

function validateResetForm({ email, recoveryCode, newPassword, confirmPassword, isStrongPassword, passwordsMatch }) {
  const errors = {}

  if (!String(email || '').trim()) {
    errors.email = 'Email is required.'
  }

  if (!String(recoveryCode || '').trim()) {
    errors.recoveryCode = 'One-time code is required.'
  } else if (!/^\d{6}$/.test(String(recoveryCode || '').trim())) {
    errors.recoveryCode = 'One-time code must be exactly 6 digits.'
  }

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

export default function ResetWithCodePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const [resetErrors, setResetErrors] = useState({})
  const [didSubmitReset, setDidSubmitReset] = useState(false)

  const isStrongPassword =
    newPassword.length >= 10 &&
    /[A-Z]/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /\d/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword)

  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword

  useEffect(() => {
    if (location.state?.email) {
      setEmail(String(location.state.email).trim().toLowerCase())
    }
    if (location.state?.recoveryCode) {
      setRecoveryCode(String(location.state.recoveryCode).trim())
    }
    if (location.state?.message) {
      setMessage(String(location.state.message))
    }
  }, [location.state])

  async function onResetPassword(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setDidSubmitReset(true)

    const nextErrors = validateResetForm({ email, recoveryCode, newPassword, confirmPassword, isStrongPassword, passwordsMatch })
    setResetErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setIsResetting(true)
    try {
      await apiRequest('/reset-password', {
        method: 'POST',
        body: {
          email: String(email || '').trim().toLowerCase(),
          recovery_code: String(recoveryCode || '').trim(),
          new_password: newPassword,
        },
      })

      setDidSubmitReset(false)
      setResetErrors({})
      navigate('/login', {
        replace: true,
        state: { message: 'Password reset successful. Please login with your new password.' },
      })
    } catch (err) {
      setError(err.message || 'Failed to reset password.')
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <main className="app auth-page">
      <header className="hero">
        <div className="brand-row">
          <img className="brand-logo" src={brandLogo} alt="SimFlow logo" />
          <div>
            <p className="brand-kicker">SimFlow</p>
            <h1>Reset With Code</h1>
          </div>
        </div>
        <p>Enter your email, one-time code, and new password.</p>
      </header>

      <section className="grid two auth-grid">
        <article className="card elevated auth-card">
          <h2>Confirm One-Time Code</h2>
          {message && <p className="banner ok" role="status" aria-live="polite">{message}</p>}
          {error && <p className="banner err" role="alert" aria-live="assertive">{error}</p>}

          <form onSubmit={onResetPassword} noValidate>
            <label htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              type="email"
              className={resetErrors.email ? 'input-invalid' : ''}
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                const value = event.target.value
                setEmail(value)
                if (didSubmitReset) {
                  setResetErrors(validateResetForm({
                    email: value,
                    recoveryCode,
                    newPassword,
                    confirmPassword,
                    isStrongPassword,
                    passwordsMatch,
                  }))
                }
              }}
            />
            {resetErrors.email && <p className="field-error">{resetErrors.email}</p>}

            <label htmlFor="reset-code">One-Time Code</label>
            <input
              id="reset-code"
              type="text"
              className={resetErrors.recoveryCode ? 'input-invalid' : ''}
              placeholder="6-digit code"
              value={recoveryCode}
              onChange={(event) => {
                const value = event.target.value
                setRecoveryCode(value)
                if (didSubmitReset) {
                  setResetErrors(validateResetForm({
                    email,
                    recoveryCode: value,
                    newPassword,
                    confirmPassword,
                    isStrongPassword,
                    passwordsMatch,
                  }))
                }
              }}
            />
            {resetErrors.recoveryCode && <p className="field-error">{resetErrors.recoveryCode}</p>}

            <label htmlFor="reset-new-password">New Password</label>
            <div className="password-row">
              <input
                id="reset-new-password"
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
                      email,
                      recoveryCode,
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
              />
              <button className="btn secondary password-toggle" type="button" onClick={() => setShowNewPassword((prev) => !prev)}>
                {showNewPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {resetErrors.newPassword && <p className="field-error">{resetErrors.newPassword}</p>}

            <label htmlFor="reset-confirm-password">Confirm Password</label>
            <div className="password-row">
              <input
                id="reset-confirm-password"
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
                      email,
                      recoveryCode,
                      newPassword,
                      confirmPassword: value,
                      isStrongPassword,
                      passwordsMatch: newPassword && value && newPassword === value,
                    }))
                  }
                }}
              />
              <button className="btn secondary password-toggle" type="button" onClick={() => setShowConfirmPassword((prev) => !prev)}>
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {resetErrors.confirmPassword && <p className="field-error">{resetErrors.confirmPassword}</p>}

            <button className="btn" type="submit" disabled={isResetting}>
              {isResetting ? 'Resetting password...' : 'Reset Password'}
            </button>
          </form>

          <p className="muted auth-switch">Need a new code? <Link to="/forgot-password">Request one</Link></p>
        </article>
      </section>
    </main>
  )
}
