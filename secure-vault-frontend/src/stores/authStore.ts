import { create } from 'zustand'
import type { User } from '@/types'

export const AUTH_USER_STORAGE_KEY = '_sv_auth_user'
export const AUTH_TOKEN_STORAGE_KEY = '_sv_access_token'

interface AuthState {
  user: User | null
  accessToken: string | null
  /** In-memory AES-GCM key derived from master password — never persisted */
  masterKey: CryptoKey | null
  /** In-memory RSA private key — never persisted */
  privateKey: CryptoKey | null
  mfaPending: boolean

  setUser: (user: User | null) => void
  setAccessToken: (token: string | null) => void
  setMasterKey: (key: CryptoKey | null) => void
  setPrivateKey: (key: CryptoKey | null) => void
  setMfaPending: (pending: boolean) => void
  logout: () => void
}

// Restore user from localStorage on mount
function loadPersistedUser(): User | null {
  try {
    const stored = localStorage.getItem(AUTH_USER_STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

// Restore access token from localStorage on mount
function loadPersistedToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: loadPersistedUser(),
  accessToken: loadPersistedToken(),
  masterKey: null,
  privateKey: null,
  mfaPending: false,

  setUser: (user) => {
    if (user) {
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(AUTH_USER_STORAGE_KEY)
    }
    set({ user })
  },
  setAccessToken: (token) => {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    }
    set({ accessToken: token })
  },
  setMasterKey:  (masterKey)  => set({ masterKey }),
  setPrivateKey: (privateKey) => set({ privateKey }),
  setMfaPending: (mfaPending) => set({ mfaPending }),

  logout: () => {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY)
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    set({ user: null, accessToken: null, masterKey: null, privateKey: null, mfaPending: false })
  },
}))
