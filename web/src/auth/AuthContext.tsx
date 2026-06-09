import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, setToken } from '../api/client'
import type { User } from '../api/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}
const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    api.auth
      .me()
      .then((u) => { if (alive) setUser(u) })
      .catch(() => { if (alive) setUser(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => {
      alive = false
    }
  }, [])

  const login = async (username: string, password: string) => {
    const res = await api.auth.login(username, password)
    setToken(res.token)
    setUser({ id: res.id, username: res.username })
  }
  const register = async (username: string, email: string, password: string) => {
    const res = await api.auth.register(username, email, password)
    setToken(res.token)
    setUser({ id: res.id, username: res.username })
  }
  const logout = async () => {
    await api.auth.logout().catch((e) => { if (!(e instanceof ApiError)) throw e })
    setToken(null)
    setUser(null)
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
  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
