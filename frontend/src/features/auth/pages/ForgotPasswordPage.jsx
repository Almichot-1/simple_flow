import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  confirmPasswordResetFirebase,
  sendPasswordResetEmailFirebase,
  verifyPasswordResetCodeFirebase,
} from '../../../shared/lib/firebase'
import brandLogo from '../../../assets/simflow-logo.svg'

function validateRecoveryRequestEmail(email) {
  const reasons = []
  const value = String(email || '').trim()

  if (!value) {
    reasons.push('Email is required.')
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    reasons.push('Please enter a valid email address.')
  }

  return reasons
}

function validateResetForm({ newPassword, confirmPassword, isStrongPassword, passwordsMatch }) {
  const reasons = []

  if (!String(newPassword || '')) {
    reasons.push('New password is required.')
  } else if (!isStrongPassword) {
    reasons.push('Password must be at least 10 characters and include uppercase, lowercase, number, and symbol.')
  }

  if (!String(confirmPassword || '')) {
    reasons.push('Confirm password is required.')
  } else if (!passwordsMatch) {
    reasons.push('Passwords do not match.')
  }

  return reasons
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

    const reasons = validateRecoveryRequestEmail(email)
    if (reasons.length > 0) {
      setError(reasons.join(' '))
      return
    }

    setIsRequesting(true)
    try {
      await sendPasswordResetEmailFirebase(email)
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

    const reasons = validateResetForm({ newPassword, confirmPassword, isStrongPassword, passwordsMatch })
    if (reasons.length > 0) {
      setError(reasons.join(' '))
      return
    }

    setIsResetting(true)
    try {
      await confirmPasswordResetFirebase(resetCode, newPassword)

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
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={Boolean(resetCode)}
            />
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
                  placeholder="New password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <button className="btn secondary password-toggle" type="button" onClick={() => setShowNewPassword((prev) => !prev)}>
                  {showNewPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              <label htmlFor="recover-confirm-password">Confirm Password</label>
              <div className="password-row">
                <input
                  id="recover-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                <button className="btn secondary password-toggle" type="button" onClick={() => setShowConfirmPassword((prev) => !prev)}>
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              <p className={`muted ${isStrongPassword ? 'ok' : ''}`}>
                Password must be at least 10 characters and include uppercase, lowercase, number, and symbol.
              </p>
              {!passwordsMatch && confirmPassword ? <p className="muted err">Passwords do not match.</p> : null}

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
