import type { PropsWithChildren } from 'react'
import { Navigate } from 'react-router-dom'
import { useFrappeAuth } from 'frappe-react-sdk'
import Spinner from '../components/Spinner'

/** Renders children only for guests; logged-in users are sent to the app. */
export default function GuestRoute({ children }: PropsWithChildren) {
  const { currentUser, isLoading } = useFrappeAuth()

  if (isLoading) return <Spinner />

  if (currentUser) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
