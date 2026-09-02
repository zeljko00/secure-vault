import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { useAuthStore } from '@/stores/authStore'

export default function App() {
  const user = useAuthStore((state) => state.user)

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={user ? <HomePage /> : <Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
