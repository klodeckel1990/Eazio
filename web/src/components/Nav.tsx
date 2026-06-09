import { NavLink } from 'react-router-dom'
import type { ComponentType, SVGProps } from 'react'
import { useAuth } from '../auth/AuthContext'
import { IconBowl, IconUser, IconBookmark, IconLeaf, IconLogout } from './icons'

interface NavItem {
  to: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tracker', Icon: IconBowl },
  { to: '/accounts', label: 'Konten', Icon: IconUser },
  { to: '/presets', label: 'Presets', Icon: IconBookmark },
]

/** Top app bar: brand, inline nav (desktop), user chip + logout. */
export function AppBar() {
  const { user, logout } = useAuth()

  return (
    <header className="appbar">
      <NavLink to="/" className="brand">
        <span className="leaf"><IconLeaf /></span>
        eazio
      </NavLink>

      <nav className="appbar-nav" aria-label="Hauptnavigation">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>

      {user && (
        <div className="user-chip">
          <span className="avatar" title={user.username}>{user.username.slice(0, 1)}</span>
          <span className="name">{user.username}</span>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            onClick={() => { void logout() }}
            aria-label="Abmelden"
            title="Abmelden"
          >
            <IconLogout />
          </button>
        </div>
      )}
    </header>
  )
}

/** Bottom tab bar — primary navigation on mobile. */
export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Navigation">
      {NAV_ITEMS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} end={to === '/'}>
          <span className="ico"><Icon /></span>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
