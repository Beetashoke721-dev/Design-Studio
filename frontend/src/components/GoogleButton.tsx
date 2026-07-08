import GoogleIcon from './GoogleIcon'
import { useGoogleLogin } from '../lib/useGoogleLogin'

export default function GoogleButton({
  label,
  onError,
}: {
  label: string
  onError: (message: string) => void
}) {
  const { redirectToGoogle, loading } = useGoogleLogin(onError)

  return (
    <button
      type="button"
      className="auth-button auth-button--google"
      onClick={redirectToGoogle}
      disabled={loading}
    >
      <GoogleIcon />
      {loading ? 'Redirecting…' : label}
    </button>
  )
}
