import type { PropsWithChildren } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useFrappeAuth } from 'frappe-react-sdk'
import Spinner from '../components/Spinner'

/** Renders children only for logged-in users; otherwise redirects to /login. */
export default function ProtectedRoute({ children }: PropsWithChildren) {
  const { currentUser, isLoading } = useFrappeAuth()
  const location = useLocation()

  if (isLoading) return <Spinner />

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}
