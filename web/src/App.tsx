import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { Nav } from './components/Nav'
import { LoginPage } from './pages/LoginPage'
import { TrackerPage } from './pages/TrackerPage'
import { AccountsPage } from './pages/AccountsPage'
import { PresetsPage } from './pages/PresetsPage'

function Shell() {
  return (
    <>
      <Nav />
      <main className="container">
        <Outlet />
      </main>
    </>
  )
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Shell />}>
              <Route path="/" element={<TrackerPage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/presets" element={<PresetsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
