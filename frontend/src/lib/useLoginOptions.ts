import { useFrappeGetCall } from 'frappe-react-sdk'

export interface LoginOptions {
  google: boolean
  signup_enabled: boolean
}

export function useLoginOptions() {
  const { data, isLoading } = useFrappeGetCall<{ message: LoginOptions }>(
    'design_studio.api.auth.login_options',
  )
  return { options: data?.message, isLoading }
}
