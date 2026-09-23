import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import { AlertTriangle, Check, Copy, Lock, UserPlus } from 'lucide-react'
import QRCode from 'react-qr-code'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import {
  generateKeyPair,
  exportPublicKeyToPEM,
  encryptPrivateKeyForStorage,
  generateMasterPassword,
} from '@/lib/crypto'
import { cn } from '@/lib/utils'
import type { User } from '@/types'

const MASTER_PASSWORD_POPUP_DURATION_S = 20
const DEFAULT_USER_PASSWORD_MIN_LENGTH = 100
const DEFAULT_MASTER_PASSWORD_LENGTH = 256

type PublicSettings = {
  user_password_min_length?: string
  master_password_length?: string
}

type RegistrationMfa = {
  challenge_id: string
  secret: string
  provisioning_uri: string
  issuer: string
  account_name: string
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function buildSchema(userPasswordMinLength: number) {
  return z
    .object({
      username: z.string().min(3, 'Username must be at least 3 characters'),
      email: z.string().email('Enter a valid email address'),
      password: z.string().min(userPasswordMinLength, `Password must be at least ${userPasswordMinLength} characters`),
      confirmPassword: z.string().min(1, 'Please confirm your password'),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    })
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>

type PrivateKeyBackupFile = {
  version: number
  createdAt: string
  encryptedPrivateKey: string
  iv: string
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
  const { setUser, savePrivateKeyBackup } = useAuthStore()
  const [apiError, setApiError] = useState<string | null>(null)
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false)
  const [masterPassword, setMasterPassword] = useState<string | null>(null)
  const [pendingMasterPassword, setPendingMasterPassword] = useState<string | null>(null)
  const [privateKeyBackup, setPrivateKeyBackup] = useState<PrivateKeyBackupFile | null>(null)
  const [registrationMfa, setRegistrationMfa] = useState<RegistrationMfa | null>(null)
  const [verifiedUser, setVerifiedUser] = useState<User | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [userPasswordMinLength, setUserPasswordMinLength] = useState(DEFAULT_USER_PASSWORD_MIN_LENGTH)
  const [masterPasswordLength, setMasterPasswordLength] = useState(DEFAULT_MASTER_PASSWORD_LENGTH)

  useEffect(() => {
    let cancelled = false

    const loadPasswordPolicy = async () => {
      try {
        const response = await api.get<PublicSettings>('/settings/public/')
        if (cancelled) {
          return
        }

        setUserPasswordMinLength(
          parsePositiveInteger(response.data.user_password_min_length, DEFAULT_USER_PASSWORD_MIN_LENGTH),
        )
        setMasterPasswordLength(
          parsePositiveInteger(
            response.data.master_password_length ?? response.data.master_password_length,
            DEFAULT_MASTER_PASSWORD_LENGTH,
          ),
        )
      } catch {
        if (cancelled) {
          return
        }

        setUserPasswordMinLength(DEFAULT_USER_PASSWORD_MIN_LENGTH)
        setMasterPasswordLength(DEFAULT_MASTER_PASSWORD_LENGTH)
      }
    }

    void loadPasswordPolicy()

    return () => {
      cancelled = true
    }
  }, [])

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
        setPendingMasterPassword(null)
        if (verifiedUser) {
          void (async () => {
            await setUser(verifiedUser)
            navigate(verifiedUser.role === 'admin' ? '/admin' : '/', { replace: true })
          })()
        }
      }
    }, 250)

    return () => window.clearInterval(timer)
  }, [masterPassword, navigate, setUser, verifiedUser])

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

  const handleVerifyMfa = async () => {
    if (!registrationMfa) {
      return
    }

    setApiError(null)
    setIsVerifyingMfa(true)

    try {
      const response = await api.post<{ user: User }>('/users/mfa/', {
        challenge_id: registrationMfa.challenge_id,
        code: mfaCode,
      })

      setVerifiedUser(response.data.user)
      setRegistrationMfa(null)
      setMfaCode('')
      if (pendingMasterPassword) {
        setMasterPassword(pendingMasterPassword)
      } else {
        await setUser(response.data.user)
        navigate(response.data.user.role === 'admin' ? '/admin' : '/', { replace: true })
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        setApiError(err.response.data?.detail ?? err.response.data?.details ?? 'Invalid verification code')
      } else {
        setApiError('Network error — please try again')
      }
    } finally {
      setIsVerifyingMfa(false)
    }
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(buildSchema(userPasswordMinLength)) })

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

      const response = await api.post<{ user: User; mfa: RegistrationMfa }>('/users/', user)
      setRegistrationMfa(response.data.mfa)
      const generatedMasterPassword = generateMasterPassword(masterPasswordLength)
      const encryptedPrivateKey = await encryptPrivateKeyForStorage(keyPair.privateKey, generatedMasterPassword)
      await savePrivateKeyBackup(response.data.user.id, encryptedPrivateKey)

      const backupPayload: PrivateKeyBackupFile = {
        version: 1,
        createdAt: new Date().toISOString(),
        encryptedPrivateKey: encryptedPrivateKey.ciphertext,
        iv: encryptedPrivateKey.iv ?? '',
        salt: encryptedPrivateKey.salt,
      }
      setPrivateKeyBackup(backupPayload)
      setPendingMasterPassword(generatedMasterPassword)
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
          <div className="w-full max-w-lg glass border border-[var(--color-border-glow)] p-6">
            <p className="mt-2 text-sm text-[var(--color-text-muted)] text-center">
              Save <span className="font-semibold text-[var(--color-primary)]">master password and key</span> to encrypt your secrets later.
            </p>
            <div className="mt-4 relative min-h-14 w-full rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-surface)] px-14 py-2 text-center font-mono text-sm break-all text-[var(--color-accent)]">
              <span className="block w-full text-center">{masterPassword}</span>
              <button
                type="button"
                onClick={handleCopyMasterPassword}
                aria-label="Copy master password"
                title="Copy master password"
                className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-primary)]/60 bg-[var(--color-primary)]/10 text-[var(--color-primary)] transition-all duration-200 hover:bg-[var(--color-primary)]/20 hover:shadow-[0_0_14px_rgba(0,212,255,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
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
            <p className="mt-3 text-xs text-[var(--color-primary)]">
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
              placeholder={`minimum ${userPasswordMinLength} characters`}
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

        {registrationMfa && (
          <div className="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-surface)] p-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Set up your authenticator</h2>
              <p className="text-xs text-[var(--color-text-dim)]">
                Scan this QR code with Microsoft Authenticator, Google Authenticator, Authy, 1Password, or another TOTP app.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--color-border-glow)] bg-[var(--color-panel)]/90 p-4 shadow-[0_0_24px_rgba(0,212,255,0.08)]">
              <div className="rounded-xl bg-white p-3 shadow-[0_0_18px_rgba(0,212,255,0.12)]">
                <QRCode
                  value={registrationMfa.provisioning_uri}
                  size={168}
                  bgColor="#FFFFFF"
                  fgColor="#080C17"
                  className="h-40 w-40 sm:h-42 sm:w-42"
                />
              </div>
              <p className="text-center text-[11px] text-[var(--color-text-dim)]">
                If scanning fails, use the secret key below for manual setup.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">Secret key</span>
              <div className="relative rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 pr-11 font-mono text-xs break-all text-[var(--color-accent)]">
                {registrationMfa.secret}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(registrationMfa.secret)
                    } catch {
                      setApiError('Could not copy the secret to clipboard')
                    }
                  }}
                  aria-label="Copy authenticator secret"
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)] transition-all duration-200 hover:bg-[var(--color-primary)]/20"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-[var(--color-text-muted)]" htmlFor="mfa-code">
                Verification code
              </label>
              <input
                id="mfa-code"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                className={inputCls}
                placeholder="123456"
              />
              <button
                type="button"
                onClick={handleVerifyMfa}
                disabled={isVerifyingMfa || mfaCode.length < 6}
                className={cn(
                  'mt-1 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  'bg-[var(--color-primary)] text-[var(--color-bg)]',
                  'hover:bg-[var(--color-primary-dim)] hover:shadow-[0_0_16px_rgba(0,212,255,0.3)]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {isVerifyingMfa ? 'Verifying…' : 'Complete registration'}
              </button>
            </div>
          </div>
        )}

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
