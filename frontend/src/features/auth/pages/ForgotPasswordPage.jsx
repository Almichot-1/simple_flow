import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiRequest } from '../../../shared/api/client'
import brandLogo from '../../../assets/simflow-logo.svg'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isRequesting, setIsRequesting] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

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
    setIsRequesting(true)
    try {
      const data = await apiRequest('/forgot-password', {
        method: 'POST',
        body: { email: String(email).trim().toLowerCase() },
      })
      if (data?.recovery_code) {
        setRecoveryCode(data.recovery_code)
      }
      setMessage('Recovery code generated. Use it below to set a new password.')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsRequesting(false)
    }
  }

  async function onResetPassword(event) {
    event.preventDefault()
    setMessage('')
    setError('')

    if (!passwordsMatch) {
      setError('Passwords do not match.')
      return
    }

    setIsResetting(true)
    try {
      await apiRequest('/reset-password', {
        method: 'POST',
        body: {
          email: String(email).trim().toLowerCase(),
          recovery_code: String(recoveryCode).trim(),
          new_password: newPassword,
        },
      })
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
        <p>Recover your account by requesting a recovery code, then setting a new password.</p>
      </header>

      <section className="grid two auth-grid">
        <article className="card elevated auth-card">
          <h2>Forgot Password</h2>
          {message && <p className="banner ok" role="status" aria-live="polite">{message}</p>}
          {error && <p className="banner err" role="alert" aria-live="assertive">{error}</p>}

          <form onSubmit={onRequestRecoveryCode}>
            <label htmlFor="recover-email">Email</label>
            <input
              id="recover-email"
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button className="btn" type="submit" disabled={isRequesting || isResetting}>
              {isRequesting ? 'Generating code...' : 'Get Recovery Code'}
            </button>
          </form>

          <form onSubmit={onResetPassword}>
            <label htmlFor="recover-code">Recovery Code</label>
            <input
              id="recover-code"
              type="text"
              placeholder="Recovery code"
              required
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value)}
            />

            <label htmlFor="recover-new-password">New Password</label>
            <div className="password-row">
              <input
                id="recover-new-password"
                type={showNewPassword ? 'text' : 'password'}
                placeholder="New password"
                autoComplete="new-password"
                minLength={10}
                required
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
                minLength={10}
                required
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

            <button className="btn" type="submit" disabled={isRequesting || isResetting || !isStrongPassword || !passwordsMatch}>
              {isResetting ? 'Resetting password...' : 'Reset Password'}
            </button>
          </form>

          <p className="muted auth-switch">Remembered your password? <Link to="/login">Back to login</Link></p>
        </article>
      </section>
    </main>
  )
}
