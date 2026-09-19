import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { ControlPanelPage } from '@/pages/ControlPanelPage'
import { LoginPage } from '@/pages/LoginPage'
import { MFAPage } from '@/pages/MFAPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { hydrateAuthStore, useAuthStore } from '@/stores/authStore'

function getLandingRoute(role?: string) {
  return role === 'admin' ? '/admin' : '/'
}

export default function App() {
  const user = useAuthStore((state) => state.user)
  const isHydrated = useAuthStore((state) => state.isHydrated)

  useEffect(() => {
    void hydrateAuthStore()
  }, [])

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] text-[var(--color-text-muted)]">
        Loading SecureVault…
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            user
              ? user.role === 'admin'
                ? <Navigate to="/admin" replace />
                : <HomePage />
              : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/admin"
          element={
            !user
              ? <Navigate to="/login" replace />
              : user.role === 'admin'
                ? <ControlPanelPage />
                : <Navigate to={getLandingRoute(user.role)} replace />
          }
        />
        <Route
          path="/login"
          element={user ? <Navigate to={getLandingRoute(user.role)} replace /> : <LoginPage />}
        />
        <Route
          path="/login/mfa"
          element={user ? <Navigate to={getLandingRoute(user.role)} replace /> : <MFAPage />}
        />
        <Route
          path="/register"
          element={user ? <Navigate to={getLandingRoute(user.role)} replace /> : <RegisterPage />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
