import { useFrappeAuth, useFrappeGetDocCount } from 'frappe-react-sdk'
import './auth.css'

export default function Dashboard() {
  const { currentUser, logout } = useFrappeAuth()
  const { data: userCount } = useFrappeGetDocCount('User')

  return (
    <section id="center">
      <h1>Design Studio</h1>
      <p>Logged in as: {currentUser}</p>
      <p>Total users in system: {userCount ?? '...'}</p>
      <button type="button" className="auth-button auth-button--google" onClick={() => logout()}>
        Log out
      </button>
    </section>
  )
}
