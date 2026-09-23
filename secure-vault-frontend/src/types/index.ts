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
  last_rotated_at?: string
  is_expired?: boolean
  expires_at?: string
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
  action?: string | null
  block_index?: number | null
  previous_hash?: string | null
  block_hash?: string | null
  secret_id?: string | null
  secret_label?: string | null
  secret_type?: SecretType | null
  is_shared_secret?: boolean | null
  is_honeypot_secret?: boolean | null
  owner_id?: string | null
  owner_username?: string | null
  user_id?: string | null
  user_username?: string | null
  accessed_by_id?: string | null
  accessed_by_username?: string | null
  timestamp: string
  ip_address?: string | null
  details?: string | null
  payload?: string | null
}

export interface HoneypotAuditLog extends SecretAuditLog {
  secret_owner_username?: string | null
}

export interface AuditTamperingDetail {
  id: string
  block_index: number
  expected_hash?: string
  actual_hash?: string
  error?: string
}

export interface AuditIntegrityStatus {
  is_valid: boolean
  first_tampering: AuditTamperingDetail | null
}
