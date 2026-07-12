import { useFrappeAuth, useFrappeGetDocCount } from 'frappe-react-sdk'
import AppNav from '../components/AppNav'

export default function Dashboard() {
  const { currentUser } = useFrappeAuth()
  const { data: userCount } = useFrappeGetDocCount('User')

  return (
    <div className="app-page">
      <AppNav />
      <section id="center">
        <h1>Design Studio</h1>
        <p>Logged in as: {currentUser}</p>
        <p>Total users in system: {userCount ?? '...'}</p>
      </section>
    </div>
  )
}
