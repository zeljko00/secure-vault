import { Lock, Unlock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  decrypted?: boolean
  className?: string
}

export function CryptoIndicator({ decrypted = false, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-mono transition-all duration-300',
        decrypted
          ? 'text-[var(--color-accent)]  drop-shadow-[0_0_6px_var(--color-accent)]'
          : 'text-[var(--color-text-dim)]',
        className,
      )}
    >
      {decrypted ? <Unlock size={12} /> : <Lock size={12} />}
      {decrypted ? 'Decrypted' : 'E2E Encrypted'}
    </span>
  )
}
