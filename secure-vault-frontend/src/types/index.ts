export type UserRole = 'admin' | 'tl' | 'dev' | 'guest'

export interface UserDeactivationRecord {
  timestamp: string
  reason?: string | null
}

export interface User {
  id: string
  username: string
  email: string
  role: UserRole
  teams?: Team[]
  deactivated?: UserDeactivationRecord[]
  pub_key: string
  join_timestamp: string
}

export interface Team {
  id: string
  name: string
  description?: string
}

export type SecretType = 'password' | 'api_key' | 'certificate' | 'other'

export interface Secret {
  id: string
  type: SecretType
  label: string
  /** base64-encoded encrypted blob */
  value: string
  iv?: string
  owner: User
}

export interface SharedSecret {
  id: string
  secret: Secret
  sharing_with: User
  sharing_expires_at?: string
  sharing_revoked: boolean
}

export interface OwnedSharedSecret {
  id: string
  secret_id: string
  secret_label: string
  secret_type: SecretType
  sharing_with_id: string
  sharing_with_username: string
  sharing_expires_at?: string
}

export interface ReceivedSharedSecret {
  id: string
  secret_id: string
  secret_label: string
  secret_type: SecretType
  owner_id: string
  owner_username: string
  sharing_expires_at?: string
  sharing_revoked: boolean
}

export interface AuditEntry {
  id: string
  timestamp: string
  ip_address?: string
  details?: string
  /** hash of this entry (chain integrity) */
  hash?: string
}

export interface SecretAuditLog {
  id: string
  secret_id?: string | null
  secret_label?: string | null
  secret_type?: SecretType | null
  owner_id?: string | null
  owner_username?: string | null
  accessed_by_id?: string | null
  accessed_by_username?: string | null
  timestamp: string
  ip_address?: string | null
  details?: string | null
}

export interface HoneypotAuditLog {
  id: string
  secret_id?: string | null
  secret_label?: string | null
  secret_type?: SecretType | null
  secret_owner_username?: string | null
  accessed_by_id?: string | null
  accessed_by_username?: string | null
  timestamp: string
  ip_address?: string | null
  details?: string | null
}
