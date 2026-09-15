import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Check, Eye, EyeOff, Plus, RefreshCw, Settings2, Trash2, UserCheck, UserX, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuthStore } from '@/stores/authStore'
import type { HoneypotAccessLog, SecretAccessLog, Team, User, UserRole } from '@/types'

const EDITABLE_ROLE_OPTIONS: Array<{ value: Exclude<UserRole, 'guest'>; label: string }> = [
  { value: 'dev', label: 'Developer' },
  { value: 'tl', label: 'Team Lead' },
]

const MANAGED_SETTINGS = [
  {
    key: 'user_password_min_length',
    label: 'Minimum user account password length',
    description: 'Applies to the login password for SecureVault accounts, separate from the client-side master password policy.',
    placeholder: '12',
    inputMode: 'numeric' as const,
  },
  {
    key: 'master_password_length',
    label: 'Master password length',
    description: 'Client-side registration and password reset flows should reject weaker master passwords.',
    placeholder: '16',
    inputMode: 'numeric' as const,
  },
  {
    key: 'secret_rotation_days',
    label: 'Secret rotation interval (days)',
    description: 'Used by policy and reminder flows to flag secrets that should be rotated.',
    placeholder: '90',
    inputMode: 'numeric' as const,
  },
  {
    key: 'session_ttl_minutes',
    label: 'Session TTL (minutes)',
    description: 'Defines how long an authenticated session should remain valid before rotation or re-authentication.',
    placeholder: '30',
    inputMode: 'numeric' as const,
  },
  {
    key: 'hidden_endpoint_enabled',
    label: 'Hidden endpoint enabled',
    description: 'Controls whether the intentionally hidden testing endpoint is enabled for security demonstrations.',
    placeholder: 'false',
    inputMode: 'text' as const,
  },
]

function normalizeSettings(values?: Record<string, unknown>): Record<string, string> {
  const normalizedValues = Object.fromEntries(MANAGED_SETTINGS.map((setting) => [setting.key, ''])) as Record<string, string>

  if (!values) {
    return normalizedValues
  }

  for (const [key, value] of Object.entries(values)) {
    normalizedValues[key] = value == null ? '' : String(value)
  }

  return normalizedValues
}

function isEnabledSetting(value?: string): boolean {
  return value?.trim().toLowerCase() === 'true'
}

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

function SecretAccessLogSection({ logs }: { logs: SecretAccessLog[] }) {
  return (
    <section className="glass rounded-3xl border border-[var(--color-border)]/80 bg-[var(--color-panel)]/70 p-6 shadow-[0_18px_64px_rgba(2,8,23,0.45)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)]/80 pb-4">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl border border-[var(--color-border-glow)] bg-[var(--color-primary)]/10 p-3 text-[var(--color-primary)]">
            <Eye size={18} />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">Secret access logs</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Shared secret retrieval events recorded for administrative review.
            </p>
          </div>
        </div>
        <StatusBadge variant="active" label={`${logs.length} events`} />
      </div>

      {logs.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-10 text-center text-sm text-[var(--color-text-dim)]">
          No secret access activity has been recorded yet.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-surface)]/70">
          <div className="min-w-[960px]">
            <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-4 border-b border-[var(--color-border)]/80 px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-dim)]">
              <span>Secret</span>
              <span>Owner</span>
              <span>Accessed by</span>
              <span>Timestamp</span>
              <span>Origin</span>
            </div>
            <div>
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-4 border-b border-[var(--color-border)]/60 px-5 py-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">
                        {log.secret_label ?? 'Secret removed'}
                      </p>
                      {log.secret_type ? <StatusBadge variant={log.secret_type} /> : <StatusBadge variant="other" label="Unknown" />}
                    </div>
                  </div>
                  <div className="min-w-0 text-sm text-[var(--color-text-muted)]">
                    <p className="truncate">{log.owner_username ?? 'Unknown owner'}</p>
                  </div>
                  <div className="min-w-0 text-sm text-[var(--color-text-muted)]">
                    <p className="truncate">{log.accessed_by_username ?? 'Unknown user'}</p>
                  </div>
                  <div className="text-sm text-[var(--color-text-muted)]">{formatDateTime(log.timestamp)}</div>
                  <div className="min-w-0 text-sm text-[var(--color-text-muted)]">
                    <p className="truncate font-mono text-xs text-[var(--color-text-dim)]">{log.ip_address ?? 'Unknown IP'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function HoneypotAccessLogSection({ logs }: { logs: HoneypotAccessLog[] }) {
  return (
    <section className="glass rounded-3xl border border-[var(--color-border)]/80 bg-[var(--color-panel)]/70 p-6 shadow-[0_18px_64px_rgba(2,8,23,0.45)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)]/80 pb-4">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl border border-[var(--color-honeypot)]/40 bg-[var(--color-honeypot)]/10 p-3 text-[var(--color-honeypot)]">
            <EyeOff size={18} />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">Honeypot access logs</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Hidden endpoint hits captured for intrusion detection and investigation.
            </p>
          </div>
        </div>
        <StatusBadge variant="honeypot" label={`${logs.length} triggers`} />
      </div>

      {logs.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-10 text-center text-sm text-[var(--color-text-dim)]">
          No honeypot activity has been recorded yet.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-surface)]/70">
          <div className="min-w-[1040px]">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-4 border-b border-[var(--color-border)]/80 px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-dim)]">
              <span>Secret</span>
              <span>Accessed by</span>
              <span>Timestamp</span>
              <span>Origin</span>
            </div>
            <div>
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-4 border-b border-[var(--color-border)]/60 px-5 py-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">
                        {log.secret_label ?? 'Secret removed'}
                      </p>
                      <StatusBadge variant='honeypot' />
                    </div>
                  </div>
                  <div className="min-w-0 text-sm text-[var(--color-text-muted)]">
                    <p className="truncate">{log.accessed_by_username ?? 'Unknown user'}</p>
                  </div>
                  <div className="text-sm text-[var(--color-text-muted)]">{formatDateTime(log.timestamp)}</div>
                  <div className="min-w-0 text-sm text-[var(--color-text-muted)]">
                    <p className="truncate font-mono text-xs text-[var(--color-text-dim)]">{log.ip_address ?? 'Unknown IP'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function SettingsManagementSection({
  settingsValues,
  savingSettingKey,
  onSettingChange,
  onSaveSetting,
}: {
  settingsValues: Record<string, string>
  savingSettingKey: string | null
  onSettingChange: (key: string, value: string) => void
  onSaveSetting: (key: string) => void
}) {
  const additionalSettingKeys = Object.keys(settingsValues)
    .filter((key) => !MANAGED_SETTINGS.some((setting) => setting.key === key))
    .sort((left, right) => left.localeCompare(right))

  return (
    <section className="glass rounded-3xl border border-[var(--color-border)]/80 bg-[var(--color-panel)]/70 p-6 shadow-[0_18px_64px_rgba(2,8,23,0.45)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)]/80 pb-4">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl border border-[var(--color-border-glow)] bg-[var(--color-primary)]/10 p-3 text-[var(--color-primary)]">
            <Settings2 size={18} />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">Security settings</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Update policy values that govern password strength, secret rotation, and session lifetime.
            </p>
          </div>
        </div>
        <StatusBadge variant="active" label={`${Object.keys(settingsValues).length} settings`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {MANAGED_SETTINGS.map((setting) => {
          const isSaving = savingSettingKey === setting.key
          const isHiddenEndpointToggle = setting.key === 'hidden_endpoint_enabled'
          const isEnabled = isEnabledSetting(settingsValues[setting.key])

          return (
            <div key={setting.key} className="rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-surface)]/70 p-5">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[var(--color-text)]">{setting.label}</h3>
                <p className="text-sm text-[var(--color-text-muted)]">{setting.description}</p>
              </div>

              <div className="mt-4 space-y-3">
                {isHiddenEndpointToggle ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    onClick={() => onSettingChange(setting.key, isEnabled ? 'false' : 'true')}
                    disabled={savingSettingKey !== null && !isSaving}
                    className={cn(
                      'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60',
                      isEnabled
                        ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                        : 'border-[var(--color-border)] bg-[var(--color-panel)]/80 text-[var(--color-text-muted)]',
                    )}
                  >
                    <span>{isEnabled ? 'Enabled' : 'Disabled'}</span>
                    <span
                      className={cn(
                        'relative inline-flex h-7 w-12 items-center rounded-full border transition-colors duration-200',
                        isEnabled
                          ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/20'
                          : 'border-[var(--color-border)] bg-[var(--color-panel)]',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute h-5 w-5 rounded-full transition-transform duration-200',
                          isEnabled
                            ? 'translate-x-6 bg-[var(--color-accent)]'
                            : 'translate-x-1 bg-[var(--color-text-dim)]',
                        )}
                      />
                    </span>
                  </button>
                ) : (
                  <input
                    type="text"
                    inputMode={setting.inputMode}
                    value={settingsValues[setting.key] ?? ''}
                    onChange={(event) => onSettingChange(setting.key, event.target.value)}
                    placeholder={setting.placeholder}
                    disabled={savingSettingKey !== null && !isSaving}
                    className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]/80 px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] transition-all focus:border-[var(--color-primary)] focus:outline-none focus:shadow-[0_0_0_2px_rgba(0,212,255,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onSaveSetting(setting.key)}
                  disabled={savingSettingKey !== null}
                  className="inline-flex items-center justify-center rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition-all duration-200 hover:bg-[var(--color-primary)]/16 hover:shadow-[0_0_18px_rgba(0,212,255,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? 'Saving…' : 'Save setting'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {additionalSettingKeys.length > 0 && (
        <div className="mt-6 rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-surface)]/70 p-5">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/80 pb-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-text-dim)]">Additional settings</h3>
            <span className="text-xs text-[var(--color-text-dim)]">Persisted keys not currently mapped to a dedicated control.</span>
          </div>
          <div className="mt-4 space-y-4">
            {additionalSettingKeys.map((key) => {
              const isSaving = savingSettingKey === key

              return (
                <div key={key} className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_auto] lg:items-center">
                  <p className="font-mono text-xs text-[var(--color-text-dim)]">{key}</p>
                  <input
                    type="text"
                    value={settingsValues[key] ?? ''}
                    onChange={(event) => onSettingChange(key, event.target.value)}
                    disabled={savingSettingKey !== null && !isSaving}
                    className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]/80 px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] transition-all focus:border-[var(--color-primary)] focus:outline-none focus:shadow-[0_0_0_2px_rgba(0,212,255,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => onSaveSetting(key)}
                    disabled={savingSettingKey !== null}
                    className="inline-flex items-center justify-center rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition-all duration-200 hover:bg-[var(--color-primary)]/16 hover:shadow-[0_0_18px_rgba(0,212,255,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function TeamManagementSection({
  teams,
  teamMemberCounts,
  teamName,
  teamDescription,
  isCreatingTeam,
  deletingTeamId,
  onTeamNameChange,
  onTeamDescriptionChange,
  onCreateTeam,
  onDeleteTeam,
}: {
  teams: Team[]
  teamMemberCounts: Record<string, number>
  teamName: string
  teamDescription: string
  isCreatingTeam: boolean
  deletingTeamId: string | null
  onTeamNameChange: (value: string) => void
  onTeamDescriptionChange: (value: string) => void
  onCreateTeam: () => void
  onDeleteTeam: (teamId: string) => void
}) {
  return (
    <section className="glass rounded-3xl border border-[var(--color-border)]/80 bg-[var(--color-panel)]/70 p-6 shadow-[0_18px_64px_rgba(2,8,23,0.45)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)]/80 pb-4">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl border border-[var(--color-border-glow)] bg-[var(--color-primary)]/10 p-3 text-[var(--color-primary)]">
            <Users size={18} />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">Team management</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Create vault teams and remove obsolete groups from the access model.
            </p>
          </div>
        </div>
        <StatusBadge variant="active" label={`${teams.length} teams`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <div className="rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-surface)]/70 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-text-dim)]">Create team</h3>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-dim)]" htmlFor="team-name">
                Team name
              </label>
              <input
                id="team-name"
                type="text"
                value={teamName}
                onChange={(event) => onTeamNameChange(event.target.value)}
                disabled={isCreatingTeam}
                placeholder="Blue Team"
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]/80 px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] transition-all focus:border-[var(--color-primary)] focus:outline-none focus:shadow-[0_0_0_2px_rgba(0,212,255,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-dim)]" htmlFor="team-description">
                Description
              </label>
              <textarea
                id="team-description"
                value={teamDescription}
                onChange={(event) => onTeamDescriptionChange(event.target.value)}
                disabled={isCreatingTeam}
                rows={4}
                placeholder="Incident response operators with access to shared remediation secrets."
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]/80 px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] transition-all focus:border-[var(--color-primary)] focus:outline-none focus:shadow-[0_0_0_2px_rgba(0,212,255,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <button
              type="button"
              onClick={onCreateTeam}
              disabled={isCreatingTeam || teamName.trim().length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-4 py-2.5 text-sm font-medium text-[var(--color-primary)] transition-all duration-200 hover:bg-[var(--color-primary)]/16 hover:shadow-[0_0_18px_rgba(0,212,255,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={16} />
              Add team
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-surface)]/70">
          <div className="flex items-center justify-between border-b border-[var(--color-border)]/80 px-5 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-text-dim)]">Existing teams</h3>
            <span className="text-xs text-[var(--color-text-dim)]">Assignments update automatically when a team is removed.</span>
          </div>

          {teams.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[var(--color-text-dim)]">
              No teams configured yet.
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]/60">
              {teams.map((team) => {
                const isDeleting = deletingTeamId === team.id

                return (
                  <div key={team.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-[var(--color-text)]">{team.name}</p>
                        <StatusBadge variant="active" label={`${teamMemberCounts[team.id] ?? 0} members`} />
                      </div>
                      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                        {team.description?.trim() || 'No description provided.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteTeam(team.id)}
                      disabled={isCreatingTeam || deletingTeamId !== null}
                      className="inline-flex items-center justify-center gap-2 self-start rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-4 py-2 text-sm font-medium text-[var(--color-danger)] transition-all duration-200 hover:bg-[var(--color-danger)]/16 hover:shadow-[0_0_18px_rgba(239,68,68,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 size={15} />
                      {isDeleting ? 'Removing…' : 'Remove team'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
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
  deactivationReasons,
  onDeactivationReasonChange,
  onDeactivateUser,
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
  deactivationReasons: Record<string, string>
  onDeactivationReasonChange: (userId: string, reason: string) => void
  onDeactivateUser: (userId: string) => void
  onToggleTeam: (userId: string, teamId: string, isAssigned: boolean) => void
}) {
  const hasEditColumn = variant === 'active'
  const hasReasonColumn = variant === 'revoked'

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
              : hasReasonColumn
                ? 'grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.2fr)]'
              : 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]',
          )}>
            <span>User</span>
            <span>Role</span>
            <span>Teams</span>
            <span>{variant === 'active' ? 'Joined' : 'Deactivated'}</span>
            {hasEditColumn && <span>Edit</span>}
            {hasReasonColumn && <span>Reason</span>}
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
                      : hasReasonColumn
                        ? 'grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.2fr)]'
                      : 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">{listedUser.username}</p>
                    <p className="truncate font-mono text-xs text-[var(--color-text-dim)]">{listedUser.email}</p>
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
                  {hasReasonColumn && (
                    <div className="text-sm text-[var(--color-text-muted)]">
                      {deactivation?.reason?.trim() || 'No reason provided'}
                    </div>
                  )}
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
                        {isEditingThisUser ? 'Done editing' : 'Edit user'}
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
                            <div className="space-y-2">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
                              Account access
                            </p>
                            <textarea
                              value={deactivationReasons[listedUser.id] ?? ''}
                              onChange={(event) => onDeactivationReasonChange(listedUser.id, event.target.value)}
                              disabled={isPending}
                              rows={3}
                              placeholder="Optional deactivation reason"
                              className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]/80 px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] transition-all focus:border-[var(--color-danger)] focus:outline-none focus:shadow-[0_0_0_2px_rgba(239,68,68,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            <button
                              type="button"
                              onClick={() => onDeactivateUser(listedUser.id)}
                              disabled={isPending}
                              className="inline-flex items-center justify-center rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-4 py-2 text-sm font-medium text-[var(--color-danger)] transition-all duration-200 hover:bg-[var(--color-danger)]/16 hover:shadow-[0_0_18px_rgba(239,68,68,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Deactivate user
                            </button>
                          </div>
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
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const [activeUsers, setActiveUsers] = useState<User[]>([])
  const [deactivatedUsers, setDeactivatedUsers] = useState<User[]>([])
  const [secretAccessLogs, setSecretAccessLogs] = useState<SecretAccessLog[]>([])
  const [honeypotAccessLogs, setHoneypotAccessLogs] = useState<HoneypotAccessLog[]>([])
  const [settingsValues, setSettingsValues] = useState<Record<string, string>>(() => normalizeSettings())
  const [teams, setTeams] = useState<Team[]>([])
  const [teamName, setTeamName] = useState('')
  const [teamDescription, setTeamDescription] = useState('')
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [deactivationReasons, setDeactivationReasons] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pendingActionUserId, setPendingActionUserId] = useState<string | null>(null)
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null)
  const [isCreatingTeam, setIsCreatingTeam] = useState(false)
  const [savingSettingKey, setSavingSettingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = async (showLoader: boolean) => {
    if (showLoader) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }

    setError(null)

    try {
      if (!user?.id) {
        throw new Error('Missing authenticated admin context.')
      }

      const [activeResponse, deactivatedResponse, teamsResponse, logsResponse, honeypotLogsResponse, settingsResponse] = await Promise.all([
        api.get<User[]>('/users/', { params: { active: '1' } }),
        api.get<User[]>('/users/', { params: { active: '0' } }),
        api.get<Team[]>('/users/teams/'),
        api.get<SecretAccessLog[]>('/secrets/access-logs/', { params: { user: user.id } }),
        api.get<HoneypotAccessLog[]>('/secrets/access-logs/honeypots/', { params: { user: user.id } }),
        api.get<Record<string, string>>('/settings/', { params: { user: user.id } }),
      ])

      setActiveUsers(Array.isArray(activeResponse.data) ? activeResponse.data : [])
      setDeactivatedUsers(Array.isArray(deactivatedResponse.data) ? deactivatedResponse.data : [])
      setTeams(Array.isArray(teamsResponse.data) ? teamsResponse.data : [])
      console.log('Secret Access Logs:', logsResponse.data)
      setSecretAccessLogs(Array.isArray(logsResponse.data) ? logsResponse.data : [])
      setHoneypotAccessLogs(Array.isArray(honeypotLogsResponse.data) ? honeypotLogsResponse.data : [])
      setSettingsValues(normalizeSettings(settingsResponse.data))
    } catch {
      setError('Unable to load user control data right now.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void fetchUsers(true)
  }, [user?.id])

  const handleToggleEditUser = (userId: string) => {
    setEditingUserId((current) => (current === userId ? null : userId))
  }

  const handleSettingChange = (key: string, value: string) => {
    setSettingsValues((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const handleDeactivationReasonChange = (userId: string, reason: string) => {
    setDeactivationReasons((current) => ({
      ...current,
      [userId]: reason,
    }))
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

  const handleDeactivateUser = async (userId: string) => {
    setPendingActionUserId(userId)
    setError(null)

    try {
      const reason = deactivationReasons[userId]?.trim()

      await api.put(`/users/${userId}/deactivate/`, reason ? { reason } : {})
      setDeactivationReasons((current) => ({ ...current, [userId]: '' }))
      setEditingUserId(null)
      await fetchUsers(false)
    } catch {
      setError('Unable to deactivate the selected user.')
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

  const handleCreateTeam = async () => {
    const normalizedTeamName = teamName.trim()
    const normalizedDescription = teamDescription.trim()

    if (!normalizedTeamName) {
      setError('Team name is required.')
      return
    }

    setIsCreatingTeam(true)
    setError(null)

    try {
      await api.post('/users/teams/', {
        name: normalizedTeamName,
        description: normalizedDescription || null,
      })

      setTeamName('')
      setTeamDescription('')
      await fetchUsers(false)
    } catch {
      setError('Unable to create the new team.')
    } finally {
      setIsCreatingTeam(false)
    }
  }

  const handleDeleteTeam = async (teamId: string) => {
    setDeletingTeamId(teamId)
    setError(null)

    try {
      await api.delete(`/users/teams/${teamId}/`)
      await fetchUsers(false)
    } catch {
      setError('Unable to remove the selected team.')
    } finally {
      setDeletingTeamId(null)
    }
  }

  const handleSaveSetting = async (key: string) => {
    if (!user?.id) {
      setError('Missing authenticated admin context.')
      return
    }

    setSavingSettingKey(key)
    setError(null)

    try {
      const response = await api.put<Record<string, string>>(
        `/settings/${encodeURIComponent(key)}/`,
        { value: settingsValues[key] ?? '' },
        { params: { user: user.id } },
      )

      setSettingsValues((current) => ({
        ...current,
        ...Object.fromEntries(
          Object.entries(response.data).map(([responseKey, responseValue]) => [
            responseKey,
            responseValue == null ? '' : String(responseValue),
          ]),
        ),
      }))
    } catch {
      setError('Unable to save the selected setting.')
    } finally {
      setSavingSettingKey(null)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const teamMemberCounts = [...activeUsers, ...deactivatedUsers].reduce<Record<string, number>>((counts, listedUser) => {
    for (const team of listedUser.teams ?? []) {
      counts[team.id] = (counts[team.id] ?? 0) + 1
    }

    return counts
  }, {})

  return (
    <div className="relative h-screen overflow-x-hidden overflow-y-auto bg-[var(--color-bg)] px-4 py-8 text-[var(--color-text)] sm:px-6 lg:px-8">
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
                Refresh view
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-4 py-2.5 text-sm font-medium text-[var(--color-danger)] transition-all duration-200 hover:bg-[var(--color-danger)]/16 hover:shadow-[0_0_18px_rgba(239,68,68,0.2)]"
              >
                Logout
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
            <SettingsManagementSection
              settingsValues={settingsValues}
              savingSettingKey={savingSettingKey}
              onSettingChange={handleSettingChange}
              onSaveSetting={(key) => {
                void handleSaveSetting(key)
              }}
            />
            <TeamManagementSection
              teams={teams}
              teamMemberCounts={teamMemberCounts}
              teamName={teamName}
              teamDescription={teamDescription}
              isCreatingTeam={isCreatingTeam}
              deletingTeamId={deletingTeamId}
              onTeamNameChange={setTeamName}
              onTeamDescriptionChange={setTeamDescription}
              onCreateTeam={() => {
                void handleCreateTeam()
              }}
              onDeleteTeam={(teamId) => {
                void handleDeleteTeam(teamId)
              }}
            />
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
              deactivationReasons={deactivationReasons}
              onDeactivationReasonChange={handleDeactivationReasonChange}
              onDeactivateUser={(userId) => {
                void handleDeactivateUser(userId)
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
              deactivationReasons={deactivationReasons}
              onDeactivationReasonChange={handleDeactivationReasonChange}
              onDeactivateUser={(userId) => {
                void handleDeactivateUser(userId)
              }}
              onToggleTeam={(userId, teamId, isAssigned) => {
                void handleToggleTeam(userId, teamId, isAssigned)
              }}
            />
            <SecretAccessLogSection logs={secretAccessLogs} />
            <HoneypotAccessLogSection logs={honeypotAccessLogs} />
          </div>
        )}
      </div>
    </div>
  )
}