import { Link, useLocation } from 'react-router-dom'
import { useFrappeAuth } from 'frappe-react-sdk'
import './AppNav.css'

export default function AppNav() {
  const { logout } = useFrappeAuth()
  const location = useLocation()

  return (
    <nav className="app-nav">
      <span className="app-nav-brand">Design Studio</span>
      <div className="app-nav-links">
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
          Dashboard
        </Link>
        <Link to="/chat" className={location.pathname === '/chat' ? 'active' : ''}>
          Chat
        </Link>
        <Link to="/image-studio" className={location.pathname === '/image-studio' ? 'active' : ''}>
          Image Studio
        </Link>
      </div>
      <button type="button" className="app-nav-logout" onClick={() => logout()}>
        Log out
      </button>
    </nav>
  )
}
