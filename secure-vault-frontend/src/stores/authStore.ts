import { create } from 'zustand'
import type { User } from '@/types'

const STORAGE_KEY = '_sv_auth_user'

interface AuthState {
  user: User | null
  /** In-memory AES-GCM key derived from master password — never persisted */
  masterKey: CryptoKey | null
  /** In-memory RSA private key — never persisted */
  privateKey: CryptoKey | null
  mfaPending: boolean

  setUser: (user: User | null) => void
  setMasterKey: (key: CryptoKey | null) => void
  setPrivateKey: (key: CryptoKey | null) => void
  setMfaPending: (pending: boolean) => void
  logout: () => void
}

// Restore user from localStorage on mount
function loadPersistedUser(): User | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: loadPersistedUser(),
  masterKey: null,
  privateKey: null,
  mfaPending: false,

  setUser: (user) => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    set({ user })
  },
  setMasterKey:  (masterKey)  => set({ masterKey }),
  setPrivateKey: (privateKey) => set({ privateKey }),
  setMfaPending: (mfaPending) => set({ mfaPending }),

  logout: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ user: null, masterKey: null, privateKey: null, mfaPending: false })
  },
}))
