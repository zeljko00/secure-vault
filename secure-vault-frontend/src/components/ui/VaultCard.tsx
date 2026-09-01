import { KeyRound, Code2, ShieldCheck, FileQuestion, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import { CryptoIndicator } from './CryptoIndicator'
import type { Secret } from '@/types'

const TYPE_ICONS = {
  password:    <KeyRound    size={16} />,
  api_key:     <Code2       size={16} />,
  certificate: <ShieldCheck size={16} />,
  other:       <FileQuestion size={16} />,
} as const

const TYPE_BORDER: Record<Secret['type'], string> = {
  password:    'border-l-[var(--color-primary)]',
  api_key:     'border-l-[var(--color-secondary)]',
  certificate: 'border-l-[var(--color-accent)]',
  other:       'border-l-[var(--color-text-dim)]',
}

interface Props {
  secret: Secret
  expiresAt?: string
  className?: string
}

export function VaultCard({ secret, expiresAt, className }: Props) {
  const navigate = useNavigate()
  const isExpiring =
    expiresAt ? new Date(expiresAt).getTime() - Date.now() < 86_400_000 * 3 : false

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/vault/${secret.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/vault/${secret.id}`)}
      className={cn(
        'glass card-hover cursor-pointer',
        'border-l-4',
        TYPE_BORDER[secret.type],
        'p-4 flex flex-col gap-2 group',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-[var(--color-text)]">
          <span className="text-[var(--color-primary)] opacity-70 group-hover:opacity-100 transition-opacity">
            {TYPE_ICONS[secret.type]}
          </span>
          <span className="font-medium truncate">{secret.label}</span>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/vault/${secret.id}`) }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:text-[var(--color-primary)]"
          aria-label="View secret"
        >
          <Eye size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge variant={secret.type} />
        <CryptoIndicator />
        {isExpiring && <StatusBadge variant="expiring" label="Expiring soon" />}
      </div>

      <p className="text-[11px] text-[var(--color-text-dim)]">
        {secret.owner.username}
      </p>
    </article>
  )
}
