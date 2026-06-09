import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="loader-screen">
        <span className="spinner" />
        <span className="sr-only">Lädt…</span>
      </div>
    )
  }
  // Remember where we were headed (incl. ?import=… deep links) so login returns here.
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}
