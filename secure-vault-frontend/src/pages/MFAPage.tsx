import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import { ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import type { User } from '@/types'

const schema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'),
})

type FormValues = z.infer<typeof schema>

export function MFAPage() {
  const navigate = useNavigate()
  const { mfaChallengeId, setUser, setMfaPending, setMfaChallengeId } = useAuthStore()
  const [apiError, setApiError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormValues) => {
    if (!mfaChallengeId) {
      navigate('/login', { replace: true })
      return
    }

    setApiError(null)

    try {
      const response = await api.post<{ user: User }>('/users/mfa/', {
        challenge_id: mfaChallengeId,
        code: data.code,
      })

      setUser(response.data.user)
      setMfaPending(false)
      setMfaChallengeId(null)
      navigate(response.data.user.role === 'admin' ? '/admin' : '/', { replace: true })
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        setApiError(err.response.data?.detail ?? err.response.data?.details ?? 'Invalid verification code')
      } else {
        setApiError('Network error — please try again')
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm glass p-8 flex flex-col gap-6">
        <div className="text-center flex flex-col items-center gap-3">
          <span className="text-[var(--color-primary)] drop-shadow-[0_0_12px_var(--color-primary)]">
            <ShieldCheck size={36} />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">MFA verification</h1>
          <p className="text-sm text-[var(--color-text-dim)]">Enter the current code from your authenticator app</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field label="Verification code" error={errors.code?.message}>
            <input
              {...register('code')}
              inputMode="numeric"
              autoComplete="one-time-code"
              className={inputCls}
              placeholder="123456"
            />
          </Field>

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'mt-2 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              'bg-[var(--color-primary)] text-[var(--color-bg)]',
              'hover:bg-[var(--color-primary-dim)] hover:shadow-[0_0_16px_rgba(0,212,255,0.3)]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isSubmitting ? 'Verifying…' : 'Verify'}
          </button>

          {apiError && (
            <p className="text-[11px] text-center text-[var(--color-danger)]">{apiError}</p>
          )}
        </form>
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