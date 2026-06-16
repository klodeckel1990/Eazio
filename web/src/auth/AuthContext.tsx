import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, getToken, setToken } from '../api/client'
import { pushTokenToWidgets } from '../lib/shared-auth'
import { disablePush, syncPushRegistration } from '../lib/push'
import { getPlatform, socialLogin } from '../lib/social-login'
import { configureBilling, logoutBilling } from '../lib/billing'
import type { SocialProvider, User } from '../api/types'

interface AuthState {
  user: User | null
  loading: boolean
  premium: boolean
  login: (username: string, password: string) => Promise<void>
  loginWithProvider: (provider: SocialProvider) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  deleteAccount: () => Promise<void>
  /** Entitlement vom Server neu holen (nach Kauf/Restore, App-Resume). */
  refreshEntitlement: () => Promise<void>
}
const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    api.auth
      .me()
      .then((u) => {
        if (alive) setUser(u)
        // existing session: make sure the widget has the current token too
        void pushTokenToWidgets(getToken())
        // APNs-Tokens rotieren — Registrierung still auffrischen (no-op im Web)
        void syncPushRegistration()
        // RevenueCat mit der userId verknüpfen (no-op im Web)
        void configureBilling(u.id)
      })
      .catch(() => { if (alive) setUser(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => {
      alive = false
    }
  }, [])

  const refreshEntitlement = async () => {
    try {
      setUser(await api.auth.me())
    } catch {
      /* Netz-/Auth-Fehler: bisherigen Stand behalten */
    }
  }
  // Nach erfolgreichem Login/Register: Token + Basis-User setzen, dann Billing
  // verknüpfen und das Entitlement (premium) vom Server nachladen.
  const onAuthed = (res: { id: string; username: string; token: string }) => {
    setToken(res.token)
    setUser({ id: res.id, username: res.username })
    void pushTokenToWidgets(res.token)
    void configureBilling(res.id)
    void refreshEntitlement()
  }
  const login = async (username: string, password: string) => {
    onAuthed(await api.auth.login(username, password))
  }
  const loginWithProvider = async (provider: SocialProvider) => {
    const { idToken, name } = await socialLogin(provider)
    onAuthed(await api.auth.oauthLogin(provider, idToken, name, getPlatform()))
  }
  const register = async (username: string, email: string, password: string) => {
    onAuthed(await api.auth.register(username, email, password))
  }
  // Lokalen Zustand kappen — gemeinsam für Logout und Konto-Löschung.
  const clearLocalSession = async () => {
    setToken(null)
    setUser(null)
    void pushTokenToWidgets(null)
    // Drop the service worker's API caches so a later login on this device
    // never sees the previous user's offline data.
    if ('caches' in window) {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.filter((k) => k.startsWith('api-')).map((k) => caches.delete(k)))
      } catch {
        // cache cleanup is best-effort
      }
    }
  }
  const logout = async () => {
    // vor dem Session-Ende, solange der Bearer noch gilt
    await disablePush().catch(() => {})
    await logoutBilling().catch(() => {})
    await api.auth.logout().catch((e) => { if (!(e instanceof ApiError)) throw e })
    await clearLocalSession()
  }
  const deleteAccount = async () => {
    // Push-Token serverseitig mitgelöscht; lokal trotzdem abmelden.
    await disablePush().catch(() => {})
    await logoutBilling().catch(() => {})
    await api.auth.deleteAccount()
    await clearLocalSession()
  }
  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        premium: !!user?.premium,
        login,
        loginWithProvider,
        register,
        logout,
        deleteAccount,
        refreshEntitlement,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
