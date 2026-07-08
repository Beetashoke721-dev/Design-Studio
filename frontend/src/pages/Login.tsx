import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFrappeAuth, type FrappeError } from 'frappe-react-sdk'
import AuthLayout from './AuthLayout'
import GoogleButton from '../components/GoogleButton'
import { useLoginOptions } from '../lib/useLoginOptions'
import { getErrorMessage } from '../lib/errors'

export default function Login() {
  const { login } = useFrappeAuth()
  const { options } = useLoginOptions()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login({ username: email, password })
      navigate('/', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err as FrappeError) ?? 'Invalid email or password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue to Design Studio"
      footer={
        <>
          Don&apos;t have an account? <Link to="/signup">Sign up</Link>
        </>
      }
    >
      {options?.google && <GoogleButton label="Continue with Google" onError={setError} />}
      {options?.google && <div className="auth-divider">or</div>}

      <form className="auth-form" onSubmit={onSubmit}>
        {error && <div className="auth-error">{error}</div>}

        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="auth-input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="auth-input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button type="submit" className="auth-button auth-button--primary" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  )
}
