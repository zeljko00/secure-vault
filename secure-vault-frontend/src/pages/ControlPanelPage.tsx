import { useEffect, useState } from 'react'
import { Activity, RefreshCw, ShieldAlert, UserCheck, UserX } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { User } from '@/types'

function formatDateTime(value: string): string {
  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown'
  }

  return parsed.toLocaleString()
}

function getDeactivationRecord(user: User) {
  return user.deactivated?.[0]
}

function UserSection({
  title,
  description,
  icon,
  users,
  emptyState,
  variant,
}: {
  title: string
  description: string
  icon: React.ReactNode
  users: User[]
  emptyState: string
  variant: 'active' | 'revoked'
}) {
  return (
    <section className="glass rounded-3xl border border-[var(--color-border)]/80 bg-[var(--color-panel)]/70 p-6 shadow-[0_18px_64px_rgba(2,8,23,0.45)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)]/80 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="rounded-2xl border border-[var(--color-border-glow)] bg-[var(--color-primary)]/10 p-3 text-[var(--color-primary)]">
              {icon}
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">{title}</h2>
              <p className="text-sm text-[var(--color-text-muted)]">{description}</p>
            </div>
          </div>
        </div>
        <StatusBadge variant={variant} label={`${users.length} users`} />
      </div>

      {users.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-10 text-center text-sm text-[var(--color-text-dim)]">
          {emptyState}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-surface)]/70">
          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] gap-4 border-b border-[var(--color-border)]/80 px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-dim)]">
            <span>User</span>
            <span>Role</span>
            <span>Teams</span>
            <span>{variant === 'active' ? 'Joined' : 'Deactivated'}</span>
          </div>
          <div>
            {users.map((listedUser) => {
              const deactivation = getDeactivationRecord(listedUser)

              return (
                <div
                  key={listedUser.id}
                  className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] gap-4 border-b border-[var(--color-border)]/60 px-5 py-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">{listedUser.username}</p>
                    <p className="truncate font-mono text-xs text-[var(--color-text-dim)]">{listedUser.email}</p>
                    {deactivation?.reason && (
                      <p className="mt-1 text-xs text-[var(--color-warning)]">Reason: {deactivation.reason}</p>
                    )}
                  </div>
                  <div className="flex items-start">
                    <StatusBadge variant={listedUser.role} />
                  </div>
                  <div className="text-sm text-[var(--color-text-muted)]">
                    {listedUser.teams?.length ? listedUser.teams.map((team) => team.name).join(', ') : 'No teams'}
                  </div>
                  <div className="text-sm text-[var(--color-text-muted)]">
                    {variant === 'active'
                      ? formatDateTime(listedUser.join_timestamp)
                      : formatDateTime(deactivation?.timestamp ?? '')}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

export function ControlPanelPage() {
  const [activeUsers, setActiveUsers] = useState<User[]>([])
  const [deactivatedUsers, setDeactivatedUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = async (showLoader: boolean) => {
    if (showLoader) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }

    setError(null)

    try {
      const [activeResponse, deactivatedResponse] = await Promise.all([
        api.get<User[]>('/users/', { params: { active: '1' } }),
        api.get<User[]>('/users/', { params: { active: '0' } }),
      ])

      setActiveUsers(Array.isArray(activeResponse.data) ? activeResponse.data : [])
      setDeactivatedUsers(Array.isArray(deactivatedResponse.data) ? deactivatedResponse.data : [])
    } catch {
      setError('Unable to load user control data right now.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void fetchUsers(true)
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg)] px-4 py-8 text-[var(--color-text)] sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(0,212,255,0.14),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(124,58,237,0.14),_transparent_28%)]" />
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_1px_1px,_var(--color-border)_1px,_transparent_0)] [background-size:26px_26px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="glass rounded-[28px] border border-[var(--color-border)]/80 bg-[var(--color-panel)]/75 p-6 shadow-[0_18px_64px_rgba(2,8,23,0.5)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.02em] text-[var(--color-text)] sm:text-4xl">
                SecureVault - Control Panel
              </h1>
            </div>

            <button
              type="button"
              onClick={() => void fetchUsers(false)}
              disabled={isLoading || isRefreshing}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition-all duration-200',
                'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]',
                'hover:bg-[var(--color-primary)]/16 hover:shadow-[0_0_18px_rgba(0,212,255,0.22)]',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              <RefreshCw size={16} className={cn(isRefreshing && 'animate-spin')} />
              Refresh users
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/75 p-4">
              <div className="flex items-center gap-3 text-[var(--color-primary)]">
                <Activity size={18} />
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-dim)]">Total users</span>
              </div>
              <p className="mt-3 text-3xl font-semibold text-[var(--color-text)]">{activeUsers.length + deactivatedUsers.length}</p>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/75 p-4">
              <div className="flex items-center gap-3 text-[var(--color-accent)]">
                <UserCheck size={18} />
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-dim)]">Active users</span>
              </div>
              <p className="mt-3 text-3xl font-semibold text-[var(--color-text)]">{activeUsers.length}</p>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/75 p-4">
              <div className="flex items-center gap-3 text-[var(--color-danger)]">
                <UserX size={18} />
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-dim)]">Deactivated users</span>
              </div>
              <p className="mt-3 text-3xl font-semibold text-[var(--color-text)]">{deactivatedUsers.length}</p>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="glass rounded-3xl border border-[var(--color-border)]/80 bg-[var(--color-panel)]/70 px-6 py-16 text-center text-sm text-[var(--color-text-muted)]">
            Loading admin control data…
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <UserSection
              title="Active users"
              description="Accounts currently enabled for authentication and vault access."
              icon={<UserCheck size={18} />}
              users={activeUsers}
              emptyState="No active users found."
              variant="active"
            />
            <UserSection
              title="Deactivated users"
              description="Accounts removed from active access."
              icon={<UserX size={18} />}
              users={deactivatedUsers}
              emptyState="No deactivated users found."
              variant="revoked"
            />
          </div>
        )}
      </div>
    </div>
  )
}