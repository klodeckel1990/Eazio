import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppBar, TabBar } from './components/Nav'
import { LoginPage } from './pages/LoginPage'
import { TrackerPage } from './pages/TrackerPage'
import { AccountsPage } from './pages/AccountsPage'
import { PresetsPage } from './pages/PresetsPage'
import { RecipesPage } from './pages/RecipesPage'
import { RecipeDetailPage } from './pages/RecipeDetailPage'
import { ImportPage } from './pages/ImportPage'

function Shell() {
  return (
    <div className="app">
      <AppBar />
      <main className="main">
        <Outlet />
      </main>
      <TabBar />
    </div>
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
              <Route path="/recipes" element={<RecipesPage />} />
              <Route path="/recipes/:id" element={<RecipeDetailPage />} />
              <Route path="/import" element={<ImportPage />} />
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
