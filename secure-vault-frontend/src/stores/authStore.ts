import { create } from 'zustand'
import type { EncryptedPrivateKeyBlob } from '@/lib/crypto'
import type { User } from '@/types'
import { generateDeviceId } from '@/lib/utils'

export const AUTH_USER_STORAGE_KEY = '_sv_auth_user'
export const AUTH_DEVICE_ID_STORAGE_KEY = '_sv_device_id'
export const AUTH_NOTICE_STORAGE_KEY = '_sv_auth_notice'

const AUTH_DB_NAME = 'secure-vault-auth'
const AUTH_STORE_NAME = 'entries'

type AuthNotice = {
  message: string
}

type AuthEntry = {
  key: string
  value: string
}

type AuthPrivateKeyEntry = {
  key: string
  value: EncryptedPrivateKeyBlob
}

interface AuthState {
  user: User | null
  isHydrated: boolean
  /** In-memory AES-GCM key derived from master password — never persisted */
  masterKey: CryptoKey | null
  /** In-memory RSA private key — never persisted */
  privateKey: CryptoKey | null
  mfaPending: boolean
  mfaChallengeId: string | null
  authNotice: string | null
  privateKeyBackup: EncryptedPrivateKeyBlob | null

  setUser: (user: User | null) => Promise<void>
  setMasterKey: (key: CryptoKey | null) => void
  setPrivateKey: (key: CryptoKey | null) => void
  loadPrivateKeyBackup: (userId: string) => Promise<EncryptedPrivateKeyBlob | null>
  savePrivateKeyBackup: (userId: string, blob: EncryptedPrivateKeyBlob) => Promise<void>
  removePrivateKeyBackup: (userId: string) => Promise<void>
  setMfaPending: (pending: boolean) => void
  setMfaChallengeId: (challengeId: string | null) => void
  setAuthNotice: (message: string | null) => void
  logout: () => Promise<void>
}

let cachedDeviceId: string | null = null
let deviceIdPromise: Promise<string> | null = null

function openAuthDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUTH_DB_NAME, 1)

    request.onupgradeneeded = () => {
      request.result.createObjectStore(AUTH_STORE_NAME, { keyPath: 'key' })
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readAuthEntry<T>(key: string): Promise<T | null> {
  const db = await openAuthDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTH_STORE_NAME, 'readonly')
    const request = tx.objectStore(AUTH_STORE_NAME).get(key)

    request.onsuccess = () => {
      const entry = request.result as { value?: T } | undefined
      resolve(entry?.value ?? null)
    }

    request.onerror = () => reject(request.error)
  })
}

async function writeAuthEntry<T>(key: string, value: T): Promise<void> {
  const db = await openAuthDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTH_STORE_NAME, 'readwrite')
    tx.objectStore(AUTH_STORE_NAME).put({ key, value } as AuthEntry | AuthPrivateKeyEntry)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteAuthEntry(key: string): Promise<void> {
  const db = await openAuthDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTH_STORE_NAME, 'readwrite')
    tx.objectStore(AUTH_STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function loadPersistedUser(): Promise<User | null> {
  try {
    const stored = await readAuthEntry<string>(AUTH_USER_STORAGE_KEY)
    return stored ? JSON.parse(stored) as User : null
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

export async function loadPersistedDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId
  }

  if (deviceIdPromise) {
    return deviceIdPromise
  }

  deviceIdPromise = (async () => {
    try {
      const stored = await readAuthEntry<string>(AUTH_DEVICE_ID_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as { deviceId?: unknown }
        if (typeof parsed.deviceId === 'string' && parsed.deviceId) {
          cachedDeviceId = parsed.deviceId
          return parsed.deviceId
        }
      }

      const generated = generateDeviceId()
      cachedDeviceId = generated
      await writeAuthEntry(AUTH_DEVICE_ID_STORAGE_KEY, JSON.stringify({ deviceId: generated }))
      return generated
    } catch {
      const fallback = cachedDeviceId ?? generateDeviceId()
      cachedDeviceId = fallback
      return fallback
    } finally {
      deviceIdPromise = null
    }
  })()

  return deviceIdPromise
}

async function persistUser(user: User | null): Promise<void> {
  if (user) {
    await writeAuthEntry(AUTH_USER_STORAGE_KEY, JSON.stringify(user))
    return
  }

  await deleteAuthEntry(AUTH_USER_STORAGE_KEY)
}

export async function hydrateAuthStore(): Promise<void> {
  const [user] = await Promise.all([loadPersistedUser(), loadPersistedDeviceId()])
  useAuthStore.setState({ user, isHydrated: true })
}

async function loadPrivateKeyBackupFromDb(userId: string): Promise<EncryptedPrivateKeyBlob | null> {
  try {
    return await readAuthEntry<EncryptedPrivateKeyBlob>(`key_${userId}`)
  } catch {
    return null
  }
}

async function savePrivateKeyBackupToDb(userId: string, blob: EncryptedPrivateKeyBlob): Promise<void> {
  await writeAuthEntry(`key_${userId}`, blob)
}

async function removePrivateKeyBackupFromDb(userId: string): Promise<void> {
  await deleteAuthEntry(`key_${userId}`)
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isHydrated: false,
  masterKey: null,
  privateKey: null,
  mfaPending: false,
  mfaChallengeId: null,
  authNotice: loadPersistedAuthNotice(),
  privateKeyBackup: null,

  setUser: (user) => {
    set({ user })
    return persistUser(user).catch(() => undefined)
  },
  setMasterKey: (masterKey) => set({ masterKey }),
  setPrivateKey: (privateKey) => set({ privateKey }),
  loadPrivateKeyBackup: async (userId) => {
    const backup = await loadPrivateKeyBackupFromDb(userId)
    set({ privateKeyBackup: backup })
    return backup
  },
  savePrivateKeyBackup: async (userId, blob) => {
    await savePrivateKeyBackupToDb(userId, blob)
    set({ privateKeyBackup: blob })
  },
  removePrivateKeyBackup: async (userId) => {
    await removePrivateKeyBackupFromDb(userId)
    set((state) => ({
      privateKeyBackup: state.user?.id === userId ? null : state.privateKeyBackup,
    }))
  },
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
    set({
      user: null,
      masterKey: null,
      privateKey: null,
      privateKeyBackup: null,
      mfaPending: false,
      mfaChallengeId: null,
      authNotice: loadPersistedAuthNotice(),
    })

    return deleteAuthEntry(AUTH_USER_STORAGE_KEY).catch(() => undefined)
  },
}))
