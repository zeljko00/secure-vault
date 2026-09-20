import { LogOut, X } from 'lucide-react'

type LogoutPrivateKeyPromptProps = {
  open: boolean
  onCancel: () => void
  onSelect: (keepPrivateKeyBackup: boolean) => void | Promise<void>
}

export function LogoutPrivateKeyPrompt({ open, onCancel, onSelect }: LogoutPrivateKeyPromptProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 shadow-[0_18px_64px_rgba(2,8,23,0.5)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-dim)]">Logout</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--color-text)]">
              Keep private key backup?
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-[var(--color-border)]/80 p-2 text-[var(--color-text-dim)] transition-colors hover:border-[var(--color-border-glow)] hover:text-[var(--color-text)]"
            aria-label="Close logout prompt"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
          Keep the encrypted private key on this device for the next session? Choose No to remove it from this device.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => void onSelect(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-4 py-2.5 text-sm font-medium text-[var(--color-primary)] transition-all duration-200 hover:bg-[var(--color-primary)]/16 hover:shadow-[0_0_18px_rgba(0,212,255,0.22)]"
          >
            Keep backup
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => void onSelect(false)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/15 px-4 py-2.5 text-sm font-medium text-[var(--color-danger)] transition-all duration-200 hover:bg-[var(--color-danger)]/22 hover:shadow-[0_0_18px_rgba(239,68,68,0.2)]"
          >
            <LogOut size={16} />
            No, remove it
          </button>
        </div>
      </div>
    </div>
  )
}