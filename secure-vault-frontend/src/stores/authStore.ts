import { create } from 'zustand'
import type { User } from '@/types'

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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  masterKey: null,
  privateKey: null,
  mfaPending: false,

  setUser:       (user)       => set({ user }),
  setMasterKey:  (masterKey)  => set({ masterKey }),
  setPrivateKey: (privateKey) => set({ privateKey }),
  setMfaPending: (mfaPending) => set({ mfaPending }),

  logout: () => set({ user: null, masterKey: null, privateKey: null, mfaPending: false }),
}))
