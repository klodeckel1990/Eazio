import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) return <p>Lädt…</p>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
