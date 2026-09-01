import { cn } from '@/lib/utils'
import type { SecretType, UserRole } from '@/types'

type Variant = SecretType | UserRole | 'active' | 'expiring' | 'revoked' | 'honeypot'

const VARIANT_STYLES: Record<Variant, string> = {
  password:    'border-[var(--color-primary)]    bg-[var(--color-primary)]/10    text-[var(--color-primary)]',
  api_key:     'border-[var(--color-secondary)]  bg-[var(--color-secondary)]/10  text-[var(--color-secondary)]',
  certificate: 'border-[var(--color-accent)]     bg-[var(--color-accent)]/10     text-[var(--color-accent)]',
  other:       'border-[var(--color-text-dim)]   bg-[var(--color-text-dim)]/10   text-[var(--color-text-muted)]',
  active:      'border-[var(--color-accent)]     bg-[var(--color-accent)]/10     text-[var(--color-accent)]',
  expiring:    'border-[var(--color-warning)]    bg-[var(--color-warning)]/10    text-[var(--color-warning)]',
  revoked:     'border-[var(--color-danger)]     bg-[var(--color-danger)]/10     text-[var(--color-danger)]',
  honeypot:    'border-[var(--color-honeypot)]   bg-[var(--color-honeypot)]/10   text-[var(--color-honeypot)]',
  admin:       'border-[var(--color-danger)]     bg-[var(--color-danger)]/10     text-[var(--color-danger)]',
  tl:          'border-[var(--color-secondary)]  bg-[var(--color-secondary)]/10  text-[var(--color-secondary)]',
  dev:         'border-[var(--color-primary)]    bg-[var(--color-primary)]/10    text-[var(--color-primary)]',
  guest:       'border-[var(--color-text-dim)]   bg-[var(--color-text-dim)]/10   text-[var(--color-text-muted)]',
}

const LABELS: Partial<Record<Variant, string>> = {
  api_key: 'API Key',
  tl: 'Team Lead',
}

interface Props {
  variant: Variant
  label?: string
  className?: string
}

export function StatusBadge({ variant, label, className }: Props) {
  const text = label ?? LABELS[variant] ?? variant.charAt(0).toUpperCase() + variant.slice(1)
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border',
        VARIANT_STYLES[variant] ?? VARIANT_STYLES.other,
        className,
      )}
    >
      {text}
    </span>
  )
}
