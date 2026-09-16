import axios from 'axios'
import { AUTH_TOKEN_STORAGE_KEY, useAuthStore } from '@/stores/authStore'
import { AUTH_REFRESH_TOKEN_STORAGE_KEY } from '@/stores/authStore'

const AUTH_FAILURE_DETAILS = new Set([
  'Invalid authorization header',
  'Invalid token',
  'Token expired',
  'User is deactivated',
  'User not found',
])

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // HttpOnly cookies
  headers: { 'Content-Type': 'application/json' },
})

// Attach device fingerprint and access token headers on every request
api.interceptors.request.use(async (config) => {
  try {
    const fp = localStorage.getItem('_sv_device_id')
    if (fp) config.headers['X-Device-Id'] = fp
    
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    if (token) config.headers['Authorization'] = `Bearer ${token}`
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
        const refreshToken = localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)

        if (refreshToken && originalRequest && !(originalRequest as { _retry?: boolean })._retry && detail === 'Token expired') {
          ;(originalRequest as { _retry?: boolean })._retry = true
          console.log('Attempting to refresh access token using refresh token...')
          try {
            const refreshResponse = await axios.post('/api/users/refresh/', {
              refresh_token: refreshToken,
            })

            const { access_token: accessToken, refresh_token: newRefreshToken } = refreshResponse.data as {
              access_token: string
              refresh_token: string
            }

            useAuthStore.getState().setAccessToken(accessToken)
            useAuthStore.getState().setRefreshToken(newRefreshToken)

            originalRequest.headers = originalRequest.headers ?? ({} as typeof originalRequest.headers)
            ;(originalRequest.headers as Record<string, string>).Authorization = `Bearer ${accessToken}`

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
