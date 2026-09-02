export type UserRole = 'admin' | 'tl' | 'dev' | 'guest'

export interface User {
  id: string
  username: string
  email: string
  role: UserRole
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
  sharing_content_id: string
}

export interface AuditEntry {
  id: string
  timestamp: string
  ip_address?: string
  details?: string
  /** hash of this entry (chain integrity) */
  hash?: string
}
