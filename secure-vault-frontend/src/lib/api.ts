import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

const AUTH_FAILURE_DETAILS = new Set([
  'Invalid authorization header',
  'Invalid token',
  'Token expired',
  'User is deactivated',
  'User not found',
])

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // Include HttpOnly cookies automatically
  headers: { 'Content-Type': 'application/json' },
})

// Attach device fingerprint on every request
api.interceptors.request.use(async (config) => {
  try {
    const fp = localStorage.getItem('_sv_device_id')
    if (fp) config.headers['X-Device-Id'] = fp
  } catch {
    // localStorage not yet initialised — safe to skip
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const detail = error.response?.data?.detail
      const originalRequest = error.config

      if (
        (status === 401 || status === 403)
        && typeof detail === 'string'
        && AUTH_FAILURE_DETAILS.has(detail)
      ) {
        // Attempt to refresh using the refresh token cookie
        if (originalRequest && !(originalRequest as { _retry?: boolean })._retry && detail === 'Token expired') {
          ;(originalRequest as { _retry?: boolean })._retry = true
          console.log('Attempting to refresh access token...')
          try {
            // Refresh endpoint will use refresh_token cookie automatically
            await axios.post('/api/users/refresh/', {}, { 
              withCredentials: true 
            })

            // Retry original request (cookies are already updated)
            return api(originalRequest)
          } catch {
            useAuthStore.getState().logout()
          }
        } else {
          useAuthStore.getState().logout()
        }

        if (typeof window !== 'undefined' && !['/login', '/register'].includes(window.location.pathname)) {
          window.location.assign('/login')
        }
      }
    }

    return Promise.reject(error)
  },
)
