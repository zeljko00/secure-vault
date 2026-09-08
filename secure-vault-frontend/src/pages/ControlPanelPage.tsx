import { useEffect, useState } from 'react'
import { Activity, Check, Plus, RefreshCw, UserCheck, UserX } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { Team, User, UserRole } from '@/types'

const EDITABLE_ROLE_OPTIONS: Array<{ value: Exclude<UserRole, 'guest'>; label: string }> = [
  { value: 'dev', label: 'Developer' },
  { value: 'tl', label: 'Team Lead' },
]

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
  teams,
  emptyState,
  variant,
  editingUserId,
  pendingActionUserId,
  onToggleEditUser,
  onChangeRole,
  onToggleTeam,
}: {
  title: string
  description: string
  icon: React.ReactNode
  users: User[]
  teams: Team[]
  emptyState: string
  variant: 'active' | 'revoked'
  editingUserId: string | null
  pendingActionUserId: string | null
  onToggleEditUser: (userId: string) => void
  onChangeRole: (userId: string, role: Exclude<UserRole, 'guest'>) => void
  onToggleTeam: (userId: string, teamId: string, isAssigned: boolean) => void
}) {
  const hasEditColumn = variant === 'active'

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
          <div className={cn(
            'grid gap-4 border-b border-[var(--color-border)]/80 px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-dim)]',
            hasEditColumn
              ? 'grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1.4fr)]'
              : 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]',
          )}>
            <span>User</span>
            <span>Role</span>
            <span>Teams</span>
            <span>{variant === 'active' ? 'Joined' : 'Deactivated'}</span>
            {hasEditColumn && <span>Edit</span>}
          </div>
          <div>
            {users.map((listedUser) => {
              const deactivation = getDeactivationRecord(listedUser)
              const userTeamIds = new Set((listedUser.teams ?? []).map((team) => team.id))
              const isPending = pendingActionUserId === listedUser.id
              const isEditingThisUser = editingUserId === listedUser.id

              return (
                <div
                  key={listedUser.id}
                  className={cn(
                    'grid gap-4 border-b border-[var(--color-border)]/60 px-5 py-4 last:border-b-0',
                    hasEditColumn
                      ? 'grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1.4fr)]'
                      : 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]',
                  )}
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
                  {hasEditColumn && listedUser.role !== 'admin' && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => onToggleEditUser(listedUser.id)}
                        disabled={pendingActionUserId !== null && !isPending}
                        className={cn(
                          'inline-flex items-center justify-center rounded-2xl border px-4 py-2 text-sm font-medium transition-all duration-200',
                          isEditingThisUser
                            ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/16 hover:shadow-[0_0_18px_rgba(0,255,135,0.18)]'
                            : 'border-[var(--color-border-glow)] bg-[var(--color-panel)]/85 text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]',
                          'disabled:cursor-not-allowed disabled:opacity-60',
                        )}
                      >
                        {isEditingThisUser ? 'Done' : 'Edit user'}
                      </button>

                      {isEditingThisUser && (
                        <>
                          <div className="space-y-2">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
                              Change role
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {EDITABLE_ROLE_OPTIONS.map((roleOption) => {
                                const isCurrentRole = listedUser.role === roleOption.value

                                return (
                                  <button
                                    key={roleOption.value}
                                    type="button"
                                    onClick={() => onChangeRole(listedUser.id, roleOption.value)}
                                    disabled={isPending || isCurrentRole}
                                    className={cn(
                                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
                                      isCurrentRole
                                        ? 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                                        : 'border-[var(--color-border)] bg-[var(--color-panel)]/80 text-[var(--color-text-muted)] hover:border-[var(--color-secondary)]/40 hover:bg-[var(--color-secondary)]/10 hover:text-[var(--color-secondary)]',
                                      'disabled:cursor-not-allowed disabled:opacity-60',
                                    )}
                                  >
                                    {roleOption.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
                            Click a team to toggle access
                          </p>
                          {teams.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-panel)]/60 px-3 py-2 text-xs text-[var(--color-text-dim)]">
                              No teams configured.
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {teams.map((team) => {
                                const isAssigned = userTeamIds.has(team.id)

                                return (
                                  <button
                                    key={team.id}
                                    type="button"
                                    onClick={() => onToggleTeam(listedUser.id, team.id, isAssigned)}
                                    disabled={isPending}
                                    className={cn(
                                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
                                      isAssigned
                                        ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-danger)]/12 hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/40'
                                        : 'border-[var(--color-border)] bg-[var(--color-panel)]/80 text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]',
                                      isPending && 'cursor-not-allowed opacity-50',
                                    )}
                                    title={isAssigned ? `Remove ${team.name}` : `Assign ${team.name}`}
                                  >
                                    {isAssigned ? <Check size={12} /> : <Plus size={12} />}
                                    <span>{team.name}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
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
  const [teams, setTeams] = useState<Team[]>([])
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pendingActionUserId, setPendingActionUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = async (showLoader: boolean) => {
    if (showLoader) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }

    setError(null)

    try {
      const [activeResponse, deactivatedResponse, teamsResponse] = await Promise.all([
        api.get<User[]>('/users/', { params: { active: '1' } }),
        api.get<User[]>('/users/', { params: { active: '0' } }),
        api.get<Team[]>('/users/teams/'),
      ])

      setActiveUsers(Array.isArray(activeResponse.data) ? activeResponse.data : [])
      setDeactivatedUsers(Array.isArray(deactivatedResponse.data) ? deactivatedResponse.data : [])
      setTeams(Array.isArray(teamsResponse.data) ? teamsResponse.data : [])
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

  const handleToggleEditUser = (userId: string) => {
    setEditingUserId((current) => (current === userId ? null : userId))
  }

  const handleChangeRole = async (userId: string, role: Exclude<UserRole, 'guest'>) => {
    setPendingActionUserId(userId)
    setError(null)

    try {
      await api.put(`/users/${userId}/role/`, { role })
      setEditingUserId(userId)
      await fetchUsers(false)
    } catch {
      setError('Unable to change the selected user role.')
    } finally {
      setPendingActionUserId(null)
    }
  }

  const handleToggleTeam = async (userId: string, teamId: string, isAssigned: boolean) => {
    setPendingActionUserId(userId)
    setError(null)

    try {
      if (isAssigned) {
        await api.delete(`/users/${userId}/team/`, { data: { team: teamId } })
      } else {
        await api.put(`/users/${userId}/team/`, { team: teamId })
      }

      setEditingUserId(userId)
      await fetchUsers(false)
    } catch {
      setError(isAssigned ? 'Unable to remove the selected team.' : 'Unable to assign the selected team.')
    } finally {
      setPendingActionUserId(null)
    }
  }

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

            <div className="flex flex-wrap items-center gap-3">
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
          <div className="grid gap-6 xl:grid-cols-1">
            <UserSection
              title="Active users"
              description="Accounts currently enabled for authentication and vault access."
              icon={<UserCheck size={18} />}
              users={activeUsers}
              teams={teams}
              emptyState="No active users found."
              variant="active"
              editingUserId={editingUserId}
              pendingActionUserId={pendingActionUserId}
              onToggleEditUser={handleToggleEditUser}
              onChangeRole={(userId, role) => {
                void handleChangeRole(userId, role)
              }}
              onToggleTeam={(userId, teamId, isAssigned) => {
                void handleToggleTeam(userId, teamId, isAssigned)
              }}
            />
            <UserSection
              title="Deactivated users"
              description="Accounts removed from active access."
              icon={<UserX size={18} />}
              users={deactivatedUsers}
              teams={teams}
              emptyState="No deactivated users found."
              variant="revoked"
              editingUserId={editingUserId}
              pendingActionUserId={pendingActionUserId}
              onToggleEditUser={handleToggleEditUser}
              onChangeRole={(userId, role) => {
                void handleChangeRole(userId, role)
              }}
              onToggleTeam={(userId, teamId, isAssigned) => {
                void handleToggleTeam(userId, teamId, isAssigned)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}