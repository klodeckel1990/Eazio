import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function Nav() {
  const { user, logout } = useAuth()

  return (
    <nav>
      <NavLink to="/">Tracker</NavLink>
      <NavLink to="/accounts">Konten</NavLink>
      <NavLink to="/presets">Presets</NavLink>
      <button type="button" onClick={() => { void logout() }}>Abmelden</button>
      {user && <span>{user.username}</span>}
    </nav>
  )
}
