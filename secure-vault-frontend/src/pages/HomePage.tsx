import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import { Code2, Eye, EyeOff, FileQuestion, KeyRound, Lock, LogOut, Pencil, Plus, ShieldCheck, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { decryptAESGCM, encryptAESGCM, deriveKeyFromPassword, loadEncryptedPrivateKey, storeEncryptedPrivateKey } from '@/lib/crypto'
import { useAuthStore } from '@/stores/authStore'
import { base64ToUint8Array, cn } from '@/lib/utils'
import type { Secret, SecretType } from '@/types'
import { log } from '@/lib/debug'

const schema = z.object({
  label: z.string().min(1, 'Label is required'),
  type: z.enum(['password', 'api_key', 'certificate', 'other']),
  value: z.string().min(1, 'Secret value is required'),
})

const backupSchema = z
  .object({
    encryptedPrivateKey: z.string().min(1).optional(),
    ciphertext: z.string().min(1).optional(),
    salt: z.string().min(1),
  })
  .refine((data) => Boolean(data.encryptedPrivateKey ?? data.ciphertext), {
    message: 'Backup file is missing encrypted private key data.',
  })

type FormValues = z.infer<typeof schema>

const TYPE_ICON: Record<SecretType, React.ReactNode> = {
  password: <KeyRound size={14} />,
  api_key: <Code2 size={14} />,
  certificate: <ShieldCheck size={14} />,
  other: <FileQuestion size={14} />,
}

export function HomePage() {
  const navigate = useNavigate()
  const { user, logout, masterKey, setMasterKey } = useAuthStore()
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [apiError, setApiError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showMasterPasswordModal, setShowMasterPasswordModal] = useState(false)
  const [masterPassword, setMasterPassword] = useState('')
  const [masterPasswordError, setMasterPasswordError] = useState<string | null>(null)
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({})
  const [revealingSecretId, setRevealingSecretId] = useState<string | null>(null)
  const [revealError, setRevealError] = useState<string | null>(null)
  const [editingSecretId, setEditingSecretId] = useState<string | null>(null)
  const [isPreparingEdit, setIsPreparingEdit] = useState(false)
  const [hasIndexedDbBackup, setHasIndexedDbBackup] = useState<boolean | null>(null)
  const [backupImportStatus, setBackupImportStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'password' },
  })

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    const fetchSecrets = async () => {
      try {
        const res = await api.get<Secret[]>('/secrets/me/', {
          params: { user: user.id },
        })
        log("Fetched user's secrets:", res.data)
        setSecrets(Array.isArray(res.data) ? res.data : [])
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setSecrets([])
        } else {
          setApiError('Could not load your secrets! Please try again later.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void fetchSecrets()
  }, [user, navigate])

  useEffect(() => {
    if (!user) {
      setHasIndexedDbBackup(null)
      return
    }

    const checkIndexedDbBackup = async () => {
      try {
        const blob = await loadEncryptedPrivateKey(user.id)
        setHasIndexedDbBackup(Boolean(blob?.ciphertext && blob?.salt))
      } catch {
        setHasIndexedDbBackup(false)
      }
    }

    void checkIndexedDbBackup()
  }, [user])

  const submitSecret = async (data: FormValues, key: CryptoKey) => {
    const encryptedBlob = await encryptAESGCM(key, data.value)

    const res = await api.post<Secret>(
      '/secrets/',
      {
        label: data.label,
        type: data.type,
        value: encryptedBlob.ciphertext,
        iv: encryptedBlob.iv,
      },
      {
        params: { user: user?.id },
      },
    )

    setSecrets((prev) => [...prev, res.data])
    reset({ label: '', type: data.type, value: '' })
  }

  const updateSecret = async (secretId: string, data: FormValues, key: CryptoKey) => {
    const encryptedBlob = await encryptAESGCM(key, data.value)

    const res = await api.put<Secret>(
      `/secrets/${secretId}/`,
      {
        label: data.label,
        type: data.type,
        value: encryptedBlob.ciphertext,
        iv: encryptedBlob.iv,
      },
      {
        params: { user: user?.id },
      },
    )

    setSecrets((prev) => prev.map((secret) => (secret.id === secretId ? res.data : secret)))
    setRevealedSecrets((prev) => {
      const next = { ...prev }
      delete next[secretId]
      return next
    })
    setEditingSecretId(null)
    reset({ label: '', type: data.type, value: '' })
  }

  const onSubmit = async (data: FormValues) => {
    if (!user) {
      setApiError('Please sign in again')
      return
    }

    if (!masterKey) {
      setApiError('Enter your master password first to unlock secret encryption.')
      return
    }

    setApiError(null)
    try {
      if (editingSecretId) {
        await updateSecret(editingSecretId, data, masterKey)
      } else {
        await submitSecret(data, masterKey)
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const detail = err.response.data?.detail
        setApiError(detail ?? (editingSecretId ? 'Failed to update secret' : 'Failed to add secret'))
      } else {
        setApiError('Network error — please try again')
      }
    }
  }

  const handleStartEdit = async (secret: Secret) => {
    if (!masterKey) {
      setApiError('Enter your master password first to edit secret content.')
      return
    }

    if (!secret.iv) {
      setApiError('This secret is missing its decryption IV and cannot be edited.')
      return
    }

    setApiError(null)
    setIsPreparingEdit(true)
    try {
      const plaintext = await decryptAESGCM(masterKey, secret.value, secret.iv)
      reset({
        label: secret.label,
        type: secret.type,
        value: plaintext,
      })
      setEditingSecretId(secret.id)
    } catch {
      setApiError('Could not decrypt this secret for editing. Check that the correct master password is loaded.')
    } finally {
      setIsPreparingEdit(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingSecretId(null)
    setApiError(null)
    reset({ label: '', type: 'password', value: '' })
  }

  const handleRevealSecret = async (secret: Secret) => {
    if (revealedSecrets[secret.id]) {
      setRevealedSecrets((prev) => {
        const next = { ...prev }
        delete next[secret.id]
        return next
      })
      setRevealError(null)
      return
    }

    if (!masterKey) {
      setRevealError('Enter your master password first to reveal secret content.')
      return
    }

    if (!secret.iv) {
      setRevealError('This secret is missing its decryption IV.')
      return
    }

    setRevealError(null)
    setRevealingSecretId(secret.id)
    try {
      const plaintext = await decryptAESGCM(masterKey, secret.value, secret.iv)
      setRevealedSecrets((prev) => ({
        ...prev,
        [secret.id]: plaintext,
      }))
    } catch {
      setRevealError('Could not decrypt this secret. Check that the correct master password is loaded.')
    } finally {
      setRevealingSecretId(null)
    }
  }

  const handleMasterPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !masterPassword.trim()) return

    setMasterPasswordError(null)
    setApiError(null)
    try {
      const dict = await loadEncryptedPrivateKey(user.id)
      if (!dict || !dict.salt) {
        setMasterPasswordError('Failed to load salt — please try again')
        return
      }

      const key = await deriveKeyFromPassword(masterPassword, base64ToUint8Array(dict.salt))
      setMasterKey(key)
      setMasterPassword('')
      setShowMasterPasswordModal(false)
    } catch (err) {
      setHasIndexedDbBackup(false)
      setMasterPasswordError('Failed to derive encryption key')
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleOpenBackupImport = async () => {
    if (!user) {
      return
    }

    setBackupImportStatus(null)
    setApiError(null)

    try {
      const existing = await loadEncryptedPrivateKey(user.id)
      const hasBackup = Boolean(existing?.ciphertext && existing?.salt)
      setHasIndexedDbBackup(hasBackup)
      if (hasBackup) {
        setBackupImportStatus('Existing backup will be replaced after you choose a JSON file.')
      }
      fileInputRef.current?.click()
    } catch {
      setBackupImportStatus('Could not check IndexedDB status. Please try again.')
    }
  }

  const handleBackupFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''

    if (!user || !file) {
      return
    }

    setBackupImportStatus(null)
    setApiError(null)

    try {
      const parsed = backupSchema.parse(JSON.parse(await file.text()))
      const ciphertext = parsed.encryptedPrivateKey ?? parsed.ciphertext ?? ''

      await storeEncryptedPrivateKey(user.id, {
        ciphertext,
        salt: parsed.salt,
      })

      setHasIndexedDbBackup(true)
    } catch (error) {
      if (error instanceof z.ZodError) {
        setHasIndexedDbBackup(false)
        setBackupImportStatus(error.issues[0]?.message ?? 'Invalid backup JSON file format.')
        return
      }
      setHasIndexedDbBackup(false)
      setBackupImportStatus('Failed to import backup file. Please verify the JSON content and try again.')
    }
  }

  if (!user) {
    return null
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100 px-4 py-8 text-slate-900">
      {showMasterPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Master Password</h2>
              <button
                type="button"
                onClick={() => {
                  setShowMasterPasswordModal(false)
                  setMasterPasswordError(null)
                  setMasterPassword('')
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-600">Enter your master password to encrypt secrets.</p>
            <form onSubmit={handleMasterPasswordSubmit} className="flex flex-col gap-3">
              <input
                type="password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="Master password"
                className={cn(inputCls, 'h-11 py-0')}
              />
              {masterPasswordError && <span className="text-[11px] text-red-600">{masterPasswordError}</span>}
              <button
                type="submit"
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                  'bg-cyan-500 text-slate-950 hover:bg-cyan-400',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                Unlock
              </button>
            </form>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.14),transparent_42%),radial-gradient(circle_at_85%_10%,rgba(148,163,184,0.12),transparent_40%),linear-gradient(to_bottom,#f8fbff,#eef4fb)]" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">SecureVault</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Secret Workspace</h1>
              <p className="mt-1 text-sm text-slate-600">Add and manage encrypted secrets in your personal collection.</p>
            </div>
            <div className="flex items-stretch gap-3 self-end">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={(e) => void handleBackupFileSelected(e)}
                className="hidden"
              />

              <div className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">{user.username}</span>
                <span className="text-slate-400">•</span>
                <span className="uppercase tracking-wide">{user.role}</span>
              </div>

              <button
                type="button"
                onClick={() => void handleOpenBackupImport()}
                className={cn(
                  'inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors',
                  hasIndexedDbBackup
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <Lock size={14} />
                {hasIndexedDbBackup ? 'Private key loaded' : 'Private key not loaded'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiError(null)
                  setMasterPasswordError(null)
                  setShowMasterPasswordModal(true)
                }}
                className={cn(
                  'inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors',
                  masterKey
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <KeyRound size={14} />
                {masterKey ? 'Master password loaded' : 'Enter master password'}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          </div>
          {backupImportStatus && (
            <p className="mt-3 text-xs text-slate-600">{backupImportStatus}</p>
          )}
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur lg:col-span-5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                {editingSecretId ? 'Edit Secret' : 'New Secret'}
              </h2>
              <p className="mt-1 inline-flex items-center gap-2 text-xs text-slate-600">
                <Lock size={12} />
                Value is encrypted client-side before it is sent.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Label</label>
                <input
                  {...register('label')}
                  placeholder="e.g. GitHub API Token"
                  className={inputCls}
                />
                {errors.label?.message && <span className="text-[11px] text-red-600">{errors.label.message}</span>}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Type</label>
                <select {...register('type')} className={inputCls}>
                  <option value="password">Password</option>
                  <option value="api_key">API Key</option>
                  <option value="certificate">Certificate</option>
                  <option value="other">Other</option>
                </select>
                {errors.type?.message && <span className="text-[11px] text-red-600">{errors.type.message}</span>}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Secret Value</label>
                <textarea
                  {...register('value')}
                  rows={5}
                  placeholder="Paste secret value"
                  className={inputCls}
                />
                {errors.value?.message && <span className="text-[11px] text-red-600">{errors.value.message}</span>}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isPreparingEdit}
                className={cn(
                  'mt-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                  'bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:shadow-[0_0_16px_rgba(34,211,238,0.35)]',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {editingSecretId ? <Pencil size={15} /> : <Plus size={15} />}
                {isPreparingEdit
                  ? 'Preparing edit...'
                  : isSubmitting
                    ? editingSecretId
                      ? 'Updating...'
                      : 'Adding...'
                    : editingSecretId
                      ? 'Update secret'
                      : 'Add secret'}
              </button>

              {editingSecretId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancel edit
                </button>
              )}

              {apiError && <p className="text-sm text-red-600">{apiError}</p>}
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur lg:col-span-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Your Collection</h2>
              <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {secrets.length} items
              </span>
            </div>

            {revealError && <p className="mt-3 text-sm text-red-600">{revealError}</p>}

            {isLoading ? (
              <p className="mt-3 text-sm text-slate-500">Loading secrets...</p>
            ) : secrets.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No secrets yet. Add your first one from the form.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {secrets.map((secret) => (
                  <li
                    key={secret.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800">{secret.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {TYPE_ICON[secret.type]}
                          {secret.type.replace('_', ' ')}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleRevealSecret(secret)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100"
                        >
                          {revealedSecrets[secret.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                          {revealedSecrets[secret.id]
                            ? 'Hide'
                            : revealingSecretId === secret.id
                              ? 'Revealing...'
                              : 'Reveal'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStartEdit(secret)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] font-mono text-slate-500">Encrypted blob stored</p>
                    {revealedSecrets[secret.id] && (
                      <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 font-mono text-xs text-slate-800 break-all">
                        {revealedSecrets[secret.id]}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30'