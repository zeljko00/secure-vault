import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // HttpOnly cookies
  headers: { 'Content-Type': 'application/json' },
})

// Attach device fingerprint header on every request
api.interceptors.request.use(async (config) => {
  try {
    const fp = localStorage.getItem('_sv_device_id')
    if (fp) config.headers['X-Device-Id'] = fp
  } catch {
    // IndexedDB not yet initialised — safe to skip
  }
  return config
})
