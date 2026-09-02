import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import { Lock } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import type { User } from '@/types'
import { log } from '@/lib/debug'

const schema = z.object({
  username: z.string().min(1, 'Required'),
  password: z.string().min(1, 'Required'),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const { setUser, setMfaPending } = useAuthStore()
  const [apiError, setApiError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormValues) => {
    setApiError(null)
    try {
      const res = await api.post<User>('/users/login/', data)
      log('Login successful, user:', res.data)
      setUser(res.data)
      setMfaPending(false)
      navigate('/')
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        setApiError(err.response.data?.detail ?? err.response.data?.details ?? 'Invalid username or password')
      } else {
        setApiError('Network error — please try again')
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm glass p-8 flex flex-col gap-6">
        {/* Header */}
        <div className="text-center flex flex-col items-center gap-3">
          <span className="text-[var(--color-primary)] drop-shadow-[0_0_12px_var(--color-primary)]">
            <Lock size={36} />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            SecureVault
          </h1>
          <p className="text-sm text-[var(--color-text-dim)]">Zero-knowledge secret management</p>
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

          <Field label="Password" error={errors.password?.message}>
            <input
              {...register('password')}
              type="password"
              autoComplete="current-password"
              className={inputCls}
              placeholder="password"
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
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>

          {apiError && (
            <p className="text-[11px] text-center text-[var(--color-danger)]">{apiError}</p>
          )}
        </form>

        <p className="text-center text-xs text-[var(--color-text-dim)]">
          In case you don't have account {' '}
          <Link to="/register" className="text-[var(--color-primary)] hover:underline">
            register
          </Link>
          {' '}now!
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
