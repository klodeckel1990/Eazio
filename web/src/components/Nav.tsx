import { NavLink } from 'react-router-dom'
import type { ComponentType, SVGProps } from 'react'
import { useAuth } from '../auth/AuthContext'
import { IconBowl, IconBook, IconChart, IconWand, IconBookmark, IconBox, IconSettings, IconLogout } from './icons'

interface NavItem {
  to: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tagebuch', Icon: IconBowl },
  { to: '/stats', label: 'Verlauf', Icon: IconChart },
  { to: '/recipes', label: 'Rezepte', Icon: IconBook },
  { to: '/import', label: 'Import', Icon: IconWand },
  { to: '/presets', label: 'Presets', Icon: IconBookmark },
  { to: '/pantry', label: 'Vorrat', Icon: IconBox },
  { to: '/accounts', label: 'Einstellungen', Icon: IconSettings },
]

/** Top app bar: brand, inline nav (desktop), user chip + logout. */
export function AppBar() {
  const { user, logout } = useAuth()

  return (
    <header className="appbar">
      <NavLink to="/" className="brand">
        <img className="brand-icon" src="/icon-192.png" alt="" />
        Tellerwert
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
          <span className="lbl">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
