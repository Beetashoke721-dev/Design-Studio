import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFrappeAuth, useFrappePostCall, type FrappeError } from 'frappe-react-sdk'
import AuthLayout from './AuthLayout'
import GoogleButton from '../components/GoogleButton'
import { useLoginOptions } from '../lib/useLoginOptions'
import { getErrorMessage } from '../lib/errors'

interface SignUpResponse {
  message: { email: string; full_name: string }
}

export default function SignUp() {
  const { call } = useFrappePostCall<SignUpResponse>('design_studio.api.auth.sign_up')
  const { updateCurrentUser } = useFrappeAuth()
  const { options } = useLoginOptions()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await call({ email, full_name: fullName, password })
      updateCurrentUser()
      navigate('/', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err as FrappeError) ?? 'Could not create your account.')
    } finally {
      setSubmitting(false)
    }
  }

  if (options && !options.signup_enabled) {
    return (
      <AuthLayout
        title="Sign up disabled"
        subtitle="New accounts aren't being accepted right now."
        footer={
          <>
            Already have an account? <Link to="/login">Log in</Link>
          </>
        }
      >
        <></>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Get started with Design Studio"
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      {options?.google && <GoogleButton label="Sign up with Google" onError={setError} />}
      {options?.google && <div className="auth-divider">or</div>}

      <form className="auth-form" onSubmit={onSubmit}>
        {error && <div className="auth-error">{error}</div>}

        <div className="auth-field">
          <label htmlFor="full_name">Full name</label>
          <input
            id="full_name"
            type="text"
            className="auth-input"
            placeholder="Jane Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>

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
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        <div className="auth-field">
          <label htmlFor="confirm_password">Confirm password</label>
          <input
            id="confirm_password"
            type="password"
            className="auth-input"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        <button type="submit" className="auth-button auth-button--primary" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
    </AuthLayout>
  )
}
