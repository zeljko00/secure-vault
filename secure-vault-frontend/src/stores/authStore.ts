import { create } from 'zustand'
import type { User } from '@/types'
import { generateDeviceId } from '@/lib/utils'

export const AUTH_USER_STORAGE_KEY = '_sv_auth_user'
export const AUTH_DEVICE_ID_STORAGE_KEY = '_sv_device_id'
export const AUTH_NOTICE_STORAGE_KEY = '_sv_auth_notice'

type AuthNotice = {
  message: string
}

interface AuthState {
  user: User | null
  /** In-memory AES-GCM key derived from master password — never persisted */
  masterKey: CryptoKey | null
  /** In-memory RSA private key — never persisted */
  privateKey: CryptoKey | null
  mfaPending: boolean
  mfaChallengeId: string | null
  authNotice: string | null

  setUser: (user: User | null) => void
  setMasterKey: (key: CryptoKey | null) => void
  setPrivateKey: (key: CryptoKey | null) => void
  setMfaPending: (pending: boolean) => void
  setMfaChallengeId: (challengeId: string | null) => void
  setAuthNotice: (message: string | null) => void
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

function loadPersistedAuthNotice(): string | null {
  try {
    const stored = sessionStorage.getItem(AUTH_NOTICE_STORAGE_KEY)
    if (!stored) {
      return null
    }

    const parsed = JSON.parse(stored) as AuthNotice
    return typeof parsed.message === 'string' && parsed.message ? parsed.message : null
  } catch {
    return null
  }
}

export function loadPersistedDeviceId(): string {
  try {
    const stored = localStorage.getItem(AUTH_DEVICE_ID_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as { deviceId?: unknown }
      if (typeof parsed.deviceId === 'string' && parsed.deviceId) {
        return parsed.deviceId
      }
    }

    const generated = generateDeviceId()
    localStorage.setItem(AUTH_DEVICE_ID_STORAGE_KEY, JSON.stringify({ deviceId: generated }))
    return generated
  } catch {
    return "unknown"
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: loadPersistedUser(),
  masterKey: null,
  privateKey: null,
  mfaPending: false,
  mfaChallengeId: null,
  authNotice: loadPersistedAuthNotice(),

  setUser: (user) => {
    if (user) {
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(AUTH_USER_STORAGE_KEY)
    }
    set({ user })
  },
  setMasterKey:  (masterKey)  => set({ masterKey }),
  setPrivateKey: (privateKey) => set({ privateKey }),
  setMfaPending: (mfaPending) => set({ mfaPending }),
  setMfaChallengeId: (mfaChallengeId) => set({ mfaChallengeId }),
  setAuthNotice: (message) => {
    if (message) {
      sessionStorage.setItem(AUTH_NOTICE_STORAGE_KEY, JSON.stringify({ message }))
    } else {
      sessionStorage.removeItem(AUTH_NOTICE_STORAGE_KEY)
    }

    set({ authNotice: message })
  },
  

  logout: () => {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY)
    // it is not needed to delete device id on logout since it identifies the device, not the user.
    set({
      user: null,
      masterKey: null,
      privateKey: null,
      mfaPending: false,
      mfaChallengeId: null,
      authNotice: loadPersistedAuthNotice(),
    })
  },
}))
