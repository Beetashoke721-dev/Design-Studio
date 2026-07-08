import { useState } from 'react'
import { useFrappePostCall, type FrappeError } from 'frappe-react-sdk'
import { getErrorMessage } from './errors'

export function useGoogleLogin(onError: (message: string) => void) {
  const { call } = useFrappePostCall<{ message: string }>('design_studio.api.auth.google_login_url')
  const [loading, setLoading] = useState(false)

  const redirectToGoogle = async () => {
    setLoading(true)
    try {
      const redirect_to = `${window.location.origin}/design_studio`
      const res = await call({ redirect_to })
      window.location.href = res.message
    } catch (err) {
      onError(getErrorMessage(err as FrappeError) ?? 'Could not start Google sign-in.')
      setLoading(false)
    }
  }

  return { redirectToGoogle, loading }
}
