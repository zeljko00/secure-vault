import axios from 'axios'
import { AUTH_TOKEN_STORAGE_KEY, useAuthStore } from '@/stores/authStore'

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
  (error) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const detail = error.response?.data?.detail

      if (
        (status === 401 || status === 403)
        && typeof detail === 'string'
        && AUTH_FAILURE_DETAILS.has(detail)
      ) {
        useAuthStore.getState().logout()

        if (typeof window !== 'undefined' && !['/login', '/register'].includes(window.location.pathname)) {
          window.location.assign('/login')
        }
      }
    }

    return Promise.reject(error)
  },
)
