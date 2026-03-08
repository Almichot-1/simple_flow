import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../../../shared/api/client'

export default function RegisterPage() {
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

  async function onSubmit(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setRegisterStatus(null)
    try {
      const payload = { ...form }
      if (payload.role !== 'AGENCY') {
        payload.country = ''
        payload.phone = ''
      }
      await apiRequest('/register', { method: 'POST', body: payload })

      if (payload.role === 'AGENCY') {
        setRegisterStatus({
          steps: [
            'Step 1: Account created',
            'Step 2: Agency review pending',
            'Step 3: You can login after admin approval',
          ],
        })
        setMessage('Registration successful. Your agency is now in review.')
      } else {
        setMessage('Registration successful. You can login now.')
      }
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="app auth-page">
      <header className="hero">
        <h1>Domestic Worker Showcase</h1>
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
            <input
              id="register-password"
              type="password"
              placeholder="Password"
              autoComplete="new-password"
              minLength={8}
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
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
            <button className="btn" type="submit">Register</button>
          </form>

          <p className="muted auth-switch">Already have an account? <Link to="/login">Go to login</Link></p>
        </article>
      </section>
    </main>
  )
}
