import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore, loadPersistedDeviceId } from '@/stores/authStore'

const AUTH_FAILURE_DETAILS = new Set([
  'Invalid authorization header',
  'Invalid token',
  'Token expired',
  'Authentication credentials were not provided.',
  'User is deactivated',
  'User not found',
  'Invalid device id',
])

const REFRESHABLE_AUTH_FAILURE_DETAILS = new Set([
  'Invalid token',
  'Token expired',
  'Authentication credentials were not provided.',
])

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // Include HttpOnly cookies automatically
  headers: { 'Content-Type': 'application/json' },
})

async function attachDeviceId(config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> {
  const deviceId = await loadPersistedDeviceId() // Load device ID from IndexedDB

  if (deviceId) {
    const headers = AxiosHeaders.from(config.headers)
    headers.set('X-Device-Id', deviceId)
    config.headers = headers
  }

  return config
}

api.interceptors.request.use((config) => attachDeviceId(config))

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const detail = error.response?.data?.detail ?? error.response?.data?.details
      const originalRequest = error.config
      const requestUrl = originalRequest?.url ?? ''
      const isRefreshRequest = requestUrl.includes('/users/refresh/')

      if (
        (status === 401 || status === 403)
        && typeof detail === 'string'
        && AUTH_FAILURE_DETAILS.has(detail)
      ) {
        // Attempt to refresh using the refresh token cookie
        if (
          originalRequest
          && !(originalRequest as { _retry?: boolean })._retry
          && !isRefreshRequest
          && REFRESHABLE_AUTH_FAILURE_DETAILS.has(detail)
        ) {
          ;(originalRequest as { _retry?: boolean })._retry = true
          console.log('Attempting to refresh access token...')
          try {
            // Refresh endpoint will use refresh_token cookie automatically, and api() adds X-Device-Id.
            await api.post('/users/refresh/', {})

            // Retry original request (cookies are already updated)
            return api(originalRequest)
          } catch {
            await useAuthStore.getState().logout()
            useAuthStore.getState().setAuthNotice('Your session expired. Please sign in again.')
          }
        } else {
          await useAuthStore.getState().logout()
          useAuthStore.getState().setAuthNotice('Authentication or authorization failed!')

        }

        if (typeof window !== 'undefined' && !['/login', '/register'].includes(window.location.pathname)) {
          window.location.assign('/login')
        }
      }
    }

    return Promise.reject(error)
  },
)
