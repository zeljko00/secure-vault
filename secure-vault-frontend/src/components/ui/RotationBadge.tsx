import { AlertTriangle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Secret } from '@/types'

interface Props {
  secret: Secret
  className?: string
}

const WARNING_THRESHOLD_DAYS = 7

export function RotationBadge({ secret, className }: Props) {
  // If no rotation expiration date, don't show the badge
  if (!secret.expires_at) {
    return null
  }

  const expiresAt = new Date(secret.expires_at)
  if (Number.isNaN(expiresAt.getTime())) {
    return null
  }

  const isExpired = secret.is_expired ?? false
  const daysUntilExpiration = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const formattedExpiry = expiresAt.toLocaleString()

  if (isExpired) {
    return (
      <div
        title={`Expired on ${formattedExpiry}`}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
          'border border-[var(--color-danger)] bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
          className,
        )}
      >
        <AlertTriangle size={13} />
        <span>Expired: {formattedExpiry}</span>
      </div>
    )
  }

  // Show warning if less than 7 days left
  if (daysUntilExpiration < WARNING_THRESHOLD_DAYS && daysUntilExpiration >= 0) {
    return (
      <div
        title={`Expires ${formattedExpiry}`}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
          'border border-[var(--color-warning)] bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
          className,
        )}
      >
        <Clock size={13} />
        <span>{daysUntilExpiration} day{daysUntilExpiration !== 1 ? 's' : ''} left · {formattedExpiry}</span>
      </div>
    )
  }

  // Otherwise still surface the expiration timestamp, just without warning styling
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
        'border border-slate-300 bg-slate-50 text-slate-600',
        className,
      )}
    >
      <Clock size={13} />
      <span>Expires {formattedExpiry}</span>
    </div>
  )
}

