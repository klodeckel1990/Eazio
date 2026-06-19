import { NavLink, useLocation } from 'react-router-dom'
import { useState, type ComponentType, type SVGProps } from 'react'
import { useAuth } from '../auth/AuthContext'
import { IconBowl, IconBook, IconChart, IconWand, IconBookmark, IconBox, IconSettings, IconLogout, IconMore } from './icons'

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

// Diese Einträge sind unten nicht direkt sichtbar, sondern hinter „Mehr"
// gebündelt — sonst wird die Leiste auf kleinen Geräten / großer Schrift zu eng.
const MORE_PATHS = new Set(['/import', '/accounts'])
const TAB_PRIMARY = NAV_ITEMS.filter((i) => !MORE_PATHS.has(i.to))
const TAB_MORE = NAV_ITEMS.filter((i) => MORE_PATHS.has(i.to))

/** Bottom tab bar — primary navigation on mobile. */
export function TabBar() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const moreActive = MORE_PATHS.has(pathname)
  const close = () => setOpen(false)

  return (
    <>
      {open && (
        <button type="button" className="tabbar-scrim" aria-label="Menü schließen" onClick={close} />
      )}
      <nav className="tabbar" aria-label="Navigation">
        {TAB_PRIMARY.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={close}>
            <span className="ico"><Icon /></span>
            <span className="lbl">{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`tab-more${open || moreActive ? ' active' : ''}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="ico"><IconMore /></span>
          <span className="lbl">Mehr</span>
        </button>
      </nav>
      {open && (
        <div className="tabbar-more" role="menu">
          {TAB_MORE.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} role="menuitem" onClick={close}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </>
  )
}
