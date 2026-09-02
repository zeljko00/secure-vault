import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import { AlertTriangle, Check, Copy, Lock, UserPlus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import {
  generateKeyPair,
  exportPublicKeyToPEM,
  encryptPrivateKeyForStorage,
  storeEncryptedPrivateKey,
  generateMasterPassword,
} from '@/lib/crypto'
import { cn } from '@/lib/utils'
import type { User } from '@/types'

const MASTER_PASSWORD_POPUP_DURATION_S = 20

const schema = z
  .object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

type PrivateKeyBackupFile = {
  version: number
  createdAt: string
  encryptedPrivateKey: string
  salt: string
}

function downloadPrivateKeyBackup(payload: PrivateKeyBackupFile): void {
  const fileName = `securevault-user-key.json`
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
}

export function RegisterPage() {
  const navigate = useNavigate()
  const { setUser, setMfaPending } = useAuthStore()
  const [apiError, setApiError] = useState<string | null>(null)
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false)
  const [masterPassword, setMasterPassword] = useState<string | null>(null)
  const [privateKeyBackup, setPrivateKeyBackup] = useState<PrivateKeyBackupFile | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    if (!masterPassword) {
      return
    }

    setCopyStatus('idle')
    setSecondsLeft(MASTER_PASSWORD_POPUP_DURATION_S)
    const expiresAt = Date.now() + MASTER_PASSWORD_POPUP_DURATION_S * 1000
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0) {
        window.clearInterval(timer)
        setMasterPassword(null)
        navigate('/')
      }
    }, 250)

    return () => window.clearInterval(timer)
  }, [masterPassword, navigate])

  const handleCopyMasterPassword = async () => {
    if (!masterPassword) {
      return
    }

    try {
      await navigator.clipboard.writeText(masterPassword)
      setCopyStatus('success')
    } catch {
      setCopyStatus('error')
    }
  }

  const handleDownloadBackup = () => {
    if (!privateKeyBackup) {
      return
    }
    downloadPrivateKeyBackup(privateKeyBackup)
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormValues) => {
    setApiError(null)
    setIsGeneratingKeys(true)

    try {
      const keyPair = await generateKeyPair()
      const pubKey = await exportPublicKeyToPEM(keyPair.publicKey)

      const user = {
        username: data.username,
        email: data.email,
        password: data.password,
        pub_key: pubKey,
      }

      const response = await api.post<User>('/users/', user)
      setUser(response.data)
      setMfaPending(false)
      const generatedMasterPassword = generateMasterPassword()
      const encryptedPrivateKey = await encryptPrivateKeyForStorage(keyPair.privateKey, generatedMasterPassword)
      await storeEncryptedPrivateKey(response.data.id, encryptedPrivateKey)

      const backupPayload: PrivateKeyBackupFile = {
        version: 1,
        createdAt: new Date().toISOString(),
        encryptedPrivateKey: encryptedPrivateKey.ciphertext,
        salt: encryptedPrivateKey.salt,
      }
      setPrivateKeyBackup(backupPayload)
      
      setMasterPassword(generatedMasterPassword)
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const detail = err.response.data?.detail
        const usernameError = err.response.data?.username?.[0]
        const emailError = err.response.data?.email?.[0]
        const passwordError = err.response.data?.password?.[0]
        setApiError(detail ?? usernameError ?? emailError ?? passwordError ?? 'Registration failed')
      } else {
        setApiError('Network error — please try again')
      }
    } finally {

      setIsGeneratingKeys(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {masterPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg glass border border-[var(--color-warning)] p-6">
            <p className="mt-2 text-sm text-[var(--color-text-muted)] text-center">
              Save <span className="font-semibold text-[var(--color-warning)]">master password and key</span> to encrypt your secrets later.
            </p>
            <div className="mt-4 relative min-h-14 w-full rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-surface)] px-14 py-2 text-center font-mono text-sm break-all text-[var(--color-accent)]">
              <span className="block w-full text-center">{masterPassword}</span>
              <button
                type="button"
                onClick={handleCopyMasterPassword}
                aria-label="Copy master password"
                title="Copy master password"
                className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-warning)]/60 bg-[var(--color-warning)]/10 text-[var(--color-warning)] transition-all duration-200 hover:bg-[var(--color-warning)]/20 hover:shadow-[0_0_14px_rgba(245,158,11,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-warning)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
              >
                <Copy size={15} />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              {copyStatus === 'success' && <Check size={14} className="text-[var(--color-accent)]" aria-label="Copied" />}
              {copyStatus === 'error' && <AlertTriangle size={14} className="text-[var(--color-danger)]" aria-label="Clipboard blocked by browser" />}
            </div>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="rounded-lg border border-[var(--color-primary)]/60 bg-[var(--color-primary)]/10 px-3 py-2 text-xs font-medium text-[var(--color-primary)] transition-all hover:bg-[var(--color-primary)]/20 hover:shadow-[0_0_14px_rgba(0,212,255,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              >
                Download key backup (.json)
              </button>
            </div>
            <p className="mt-3 text-xs text-[var(--color-warning)]">
              This is shown only once and will be hidden in {secondsLeft}s.
            </p>
          </div>
        </div>
      )}

      <div className="w-full max-w-sm glass p-8 flex flex-col gap-6">
        <div className="text-center flex flex-col items-center gap-3">
          <span className="text-[var(--color-primary)] drop-shadow-[0_0_12px_var(--color-primary)]">
            <UserPlus size={36} />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            SecureVault
          </h1>
          <p className="text-sm text-[var(--color-text-dim)]">Generate identity and register SecureVault user</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field label="Username" error={errors.username?.message}>
            <input
              {...register('username')}
              autoComplete="username"
              className={inputCls}
              placeholder="username"
            />
          </Field>

          <Field label="Email" error={errors.email?.message}>
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              className={inputCls}
              placeholder="email@example.com"
            />
          </Field>

          <Field label="Password" error={errors.password?.message}>
            <input
              {...register('password')}
              type="password"
              autoComplete="new-password"
              className={inputCls}
              placeholder="password"
            />
          </Field>

          <Field label="Confirm Password" error={errors.confirmPassword?.message}>
            <input
              {...register('confirmPassword')}
              type="password"
              autoComplete="new-password"
              className={inputCls}
              placeholder="confirm password"
            />
          </Field>

          <button
            type="submit"
            disabled={isSubmitting || isGeneratingKeys}
            className={cn(
              'mt-2 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              'bg-[var(--color-primary)] text-[var(--color-bg)]',
              'hover:bg-[var(--color-primary-dim)] hover:shadow-[0_0_16px_rgba(0,212,255,0.3)]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isGeneratingKeys ? 'Generating crypto material…' : isSubmitting ? 'Creating account…' : 'Register'}
          </button>

          {apiError && (
            <p className="text-[11px] text-center text-[var(--color-danger)]">{apiError}</p>
          )}
        </form>

        <div className="text-center text-xs text-[var(--color-text-dim)] flex items-center justify-center gap-1">
          <Lock size={12} />
          <span>Key pair is generated during registration</span>
        </div>

        <p className="text-center text-xs text-[var(--color-text-dim)]">
          Already have an account? Then just{' '}
          <Link to="/login" className="text-[var(--color-primary)] hover:underline">
            sign in
          </Link> now!
        </p>
      </div>
    </div>
  )
}

const inputCls =
  'w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] glow-focus transition-all'

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[var(--color-text-muted)]">{label}</label>
      {children}
      {error && <span className="text-[11px] text-[var(--color-danger)]">{error}</span>}
    </div>
  )
}
