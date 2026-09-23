import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import { Code2, Eye, EyeOff, FileQuestion, KeyRound, Lock, LogOut, Pencil, Plus, Send, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { LogoutPrivateKeyPrompt } from '@/components/ui/LogoutPrivateKeyPrompt'
import { RotationBadge } from '@/components/ui/RotationBadge'
import {
  decryptPrivateKeyFromBlob,
  decryptAESGCM,
  decryptWithPrivateKey,
  deriveKeyFromPassword,
  encryptAESGCM,
  encryptWithPublicKey,
  importPublicKeyFromPEM,
} from '@/lib/crypto'
import { useAuthStore } from '@/stores/authStore'
import { base64ToUint8Array, cn } from '@/lib/utils'
import type { OwnedSharedSecret, ReceivedSharedSecret, Secret, SecretType, User } from '@/types'

const schema = z.object({
  label: z.string().min(1, 'Label is required'),
  type: z.enum(['password', 'api_key', 'certificate', 'other']),
  value: z.string().min(1, 'Secret value is required'),
})

const backupSchema = z
  .object({
    encryptedPrivateKey: z.string().min(1).optional(),
    ciphertext: z.string().min(1).optional(),
    iv: z.string().min(1).optional(),
    salt: z.string().min(1),
  })
  .refine((data) => Boolean(data.encryptedPrivateKey ?? data.ciphertext), {
    message: 'Backup file is missing encrypted private key data.',
  })

type FormValues = z.infer<typeof schema>
type ShareScope = 'member' | 'team'
type SharedSecretPayloadResponse = {
  cipher_text: string
}
type SharedSecretInstancesResponse = {
  id: string
  recipient_id: string
  recipient_pub_key: string
}

type SharedSecretRecipientsPayloadResponse = {
  shared_instances: SharedSecretInstancesResponse[]
}

function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatShareExpiry(value?: string): string {
  if (!value) {
    return 'No expiry'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid expiry'
  }

  return parsed.toLocaleString()
}

const TYPE_ICON: Record<SecretType, React.ReactNode> = {
  password: <KeyRound size={14} />,
  api_key: <Code2 size={14} />,
  certificate: <ShieldCheck size={14} />,
  other: <FileQuestion size={14} />,
}

export function HomePage() {
  const navigate = useNavigate()
  const { user, logout, masterKey, setMasterKey, setUser, loadPrivateKeyBackup, savePrivateKeyBackup } = useAuthStore()
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [apiError, setApiError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showMasterPasswordModal, setShowMasterPasswordModal] = useState(false)
  const [masterPassword, setMasterPassword] = useState('')
  const [masterPasswordError, setMasterPasswordError] = useState<string | null>(null)
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({})
  const [revealingSecretId, setRevealingSecretId] = useState<string | null>(null)
  const [revealError, setRevealError] = useState<string | null>(null)
  const [editingSecretId, setEditingSecretId] = useState<string | null>(null)
  const [isPreparingEdit, setIsPreparingEdit] = useState(false)
  const [originalEditingValue, setOriginalEditingValue] = useState<string | null>(null)
  const [deletingSecretId, setDeletingSecretId] = useState<string | null>(null)
  const [pendingDeleteSecret, setPendingDeleteSecret] = useState<Secret | null>(null)
  const [hasIndexedDbBackup, setHasIndexedDbBackup] = useState<boolean | null>(null)
  const [backupImportStatus, setBackupImportStatus] = useState<string | null>(null)
  const [shareTargetSecret, setShareTargetSecret] = useState<Secret | null>(null)
  const [teamMembers, setTeamMembers] = useState<User[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [isLoadingTeamMembers, setIsLoadingTeamMembers] = useState(false)
  const [shareScope, setShareScope] = useState<ShareScope>('member')
  const [shareExpiresAtInput, setShareExpiresAtInput] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [shareError, setShareError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [ownedSharedSecrets, setOwnedSharedSecrets] = useState<OwnedSharedSecret[]>([])
  const [isLoadingOwnedSharedSecrets, setIsLoadingOwnedSharedSecrets] = useState(false)
  const [ownedSharedSecretsError, setOwnedSharedSecretsError] = useState<string | null>(null)
  const [receivedSharedSecrets, setReceivedSharedSecrets] = useState<ReceivedSharedSecret[]>([])
  const [isLoadingReceivedSharedSecrets, setIsLoadingReceivedSharedSecrets] = useState(false)
  const [receivedSharedSecretsError, setReceivedSharedSecretsError] = useState<string | null>(null)
  const [revealedReceivedSecrets, setRevealedReceivedSecrets] = useState<Record<string, string>>({})
  const [revealingReceivedSecretId, setRevealingReceivedSecretId] = useState<string | null>(null)
  const [receivedRevealError, setReceivedRevealError] = useState<string | null>(null)
  const [revokeStatus, setRevokeStatus] = useState<string | null>(null)
  const [revokingSharedSecretId, setRevokingSharedSecretId] = useState<string | null>(null)
  const [showLogoutPrompt, setShowLogoutPrompt] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'password' },
  })

  const fetchOwnedSharedSecrets = useCallback(async (activeUser: User, silent = false) => {
    if (activeUser.role !== 'tl') {
      setOwnedSharedSecrets([])
      setOwnedSharedSecretsError(null)
      return
    }

    if (!silent) {
      setIsLoadingOwnedSharedSecrets(true)
    }
    setOwnedSharedSecretsError(null)

    try {
      const response = await api.get<OwnedSharedSecret[]>('/secrets/shared/by-me/', {})
      setOwnedSharedSecrets(Array.isArray(response.data) ? response.data : [])
    } catch {
      setOwnedSharedSecrets([])
      setOwnedSharedSecretsError('Could not load shared secrets. Please try again later.')
    } finally {
      if (!silent) {
        setIsLoadingOwnedSharedSecrets(false)
      }
    }
  }, [])

  const fetchReceivedSharedSecrets = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoadingReceivedSharedSecrets(true)
    }
    setReceivedSharedSecretsError(null)

    try {
      const response = await api.get<ReceivedSharedSecret[]>('/secrets/shared/with-me/', {})
      setReceivedSharedSecrets(Array.isArray(response.data) ? response.data : [])
    } catch {
      setReceivedSharedSecrets([])
      setReceivedSharedSecretsError('Could not load secrets shared with you. Please try again later.')
    } finally {
      if (!silent) {
        setIsLoadingReceivedSharedSecrets(false)
      }
    }
  }, [])

  // Fetch fresh user data on page load
  useEffect(() => {
    const fetchFreshUserData = async () => {
      try {
        const res = await api.get<User>('/users/me/', {})
        if (res.data) {
          await setUser(res.data)
        }
      } catch {
        // Silent failure - user data will stay as-is
      }
    }

    void fetchFreshUserData()
  }, [setUser])

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    const fetchSecrets = async () => {
      try {
        const res = await api.get<Secret[]>('/secrets/me/', {})
        setSecrets(Array.isArray(res.data) ? res.data : [])
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setSecrets([])
        } else {
          setApiError('Could not load your secrets! Please try again later.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void fetchSecrets()
  }, [user, navigate])

  useEffect(() => {
    if (!user) {
      setOwnedSharedSecrets([])
      setOwnedSharedSecretsError(null)
      setIsLoadingOwnedSharedSecrets(false)
      return
    }

    if (user.role !== 'tl') {
      setOwnedSharedSecrets([])
      setOwnedSharedSecretsError(null)
      setIsLoadingOwnedSharedSecrets(false)
      return
    }

    void fetchOwnedSharedSecrets(user)
  }, [user, fetchOwnedSharedSecrets, secrets] )

  useEffect(() => {
    if (!user) {
      setReceivedSharedSecrets([])
      setReceivedSharedSecretsError(null)
      setIsLoadingReceivedSharedSecrets(false)
      return
    }

    void fetchReceivedSharedSecrets()
  }, [user, fetchReceivedSharedSecrets])

  useEffect(() => {
    if (!user) {
      setHasIndexedDbBackup(null)
      return
    }

    const checkIndexedDbBackup = async () => {
      try {
        const blob = await loadPrivateKeyBackup(user.id)
        setHasIndexedDbBackup(Boolean(blob?.ciphertext && blob?.salt && blob?.iv))
      } catch {
        setHasIndexedDbBackup(false)
      }
    }

    void checkIndexedDbBackup()
  }, [user])

  const submitSecret = async (data: FormValues, key: CryptoKey) => {
    const encryptedBlob = await encryptAESGCM(key, data.value)

    const res = await api.post<Secret>(
      '/secrets/',
      {
        label: data.label,
        type: data.type,
        value: encryptedBlob.ciphertext,
        iv: encryptedBlob.iv,
      },
      {},
    )

    setSecrets((prev) => [...prev, res.data])
    reset({ label: '', type: data.type, value: '' })
  }

  const updateSecret = async (secretId: string, data: FormValues, key: CryptoKey) => {
    const encryptedBlob = await encryptAESGCM(key, data.value)

    // Detect if content actually changed (compare plaintext, not encrypted)
    const contentChanged = originalEditingValue !== null && originalEditingValue !== data.value
    const endpoint = contentChanged ? `/secrets/${secretId}/?is_rotation=true` : `/secrets/${secretId}/`

    const res = await api.put<Secret>(
      endpoint,
      {
        label: data.label,
        type: data.type,
        value: encryptedBlob.ciphertext,
        iv: encryptedBlob.iv,
      },
    )

    setSecrets((prev) => prev.map((secret) => (secret.id === secretId ? res.data : secret)))
    setRevealedSecrets((prev) => {
      const next = { ...prev }
      delete next[secretId]
      return next
    })
    setEditingSecretId(null)
    setOriginalEditingValue(null)
    reset({ label: '', type: data.type, value: '' })

    if (user?.role === 'tl') {
      const recipientsResponse = await api.get<SharedSecretRecipientsPayloadResponse>(`/secrets/${secretId}/share`, {
      })

      const instances = Array.isArray(recipientsResponse.data.shared_instances)
        ? recipientsResponse.data.shared_instances
        : []

      if (instances.length > 0) {
        const results = await Promise.allSettled(
          instances.map(async (instance) => {
            const recipientPublicKey = await importPublicKeyFromPEM(instance.recipient_pub_key)
            const encryptedPayload = await encryptWithPublicKey(recipientPublicKey, data.value)

            return api.put(
              `/secrets/shared/${instance.id}`,
              { cipher_text: encryptedPayload }
            )
          }),
        )

        const failedCount = results.filter((result) => result.status === 'rejected').length
        if (failedCount > 0) {
          throw new Error(`Secret updated, but failed to refresh ${failedCount} shared instance(s).`)
        }
      }
    }
  }

  const onSubmit = async (data: FormValues) => {
    if (!user) {
      setApiError('Please sign in again')
      return
    }

    if (!masterKey) {
      setApiError('Enter your master password first to unlock secret encryption.')
      return
    }

    setApiError(null)
    try {
      if (editingSecretId) {
        await updateSecret(editingSecretId, data, masterKey)
      } else {
        await submitSecret(data, masterKey)
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const detail = err.response.data?.detail
        setApiError(detail ?? (editingSecretId ? 'Failed to update secret' : 'Failed to add secret'))
      } else if (err instanceof Error) {
        setApiError(err.message)
      } else {
        setApiError('Network error — please try again')
      }
    }
  }

  const handleStartEdit = async (secret: Secret) => {
    if (secret.is_expired) {
      setApiError('Expired secrets cannot be edited. Rotation is required before further changes.')
      return
    }

    if (!masterKey) {
      setApiError('Enter your master password first to edit secret content.')
      return
    }

    if (!secret.iv) {
      setApiError('This secret is missing its decryption IV and cannot be edited.')
      return
    }

    setApiError(null)
    setIsPreparingEdit(true)
    try {
      const plaintext = await decryptAESGCM(masterKey, secret.value, secret.iv)
      reset({
        label: secret.label,
        type: secret.type,
        value: plaintext,
      })
      setOriginalEditingValue(plaintext)
      setEditingSecretId(secret.id)
    } catch {
      setApiError('Could not decrypt this secret for editing. Check that the correct master password is loaded.')
    } finally {
      setIsPreparingEdit(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingSecretId(null)
    setOriginalEditingValue(null)
    setApiError(null)
    reset({ label: '', type: 'password', value: '' })
  }

  const handleDeleteSecret = async () => {
    if (!user) {
      setApiError('Please sign in again')
      return
    }

    if (!pendingDeleteSecret) {
      return
    }

    const secret = pendingDeleteSecret

    setApiError(null)
    setDeletingSecretId(secret.id)

    try {
      await api.delete(`/secrets/${secret.id}/`, {})

      setSecrets((prev) => prev.filter((item) => item.id !== secret.id))
      setRevealedSecrets((prev) => {
        const next = { ...prev }
        delete next[secret.id]
        return next
      })

      if (editingSecretId === secret.id) {
        setEditingSecretId(null)
        reset({ label: '', type: 'password', value: '' })
      }

      setPendingDeleteSecret(null)
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const detail = err.response.data?.detail
        setApiError(detail ?? 'Failed to delete secret')
      } else {
        setApiError('Network error — please try again')
      }
    } finally {
      setDeletingSecretId(null)
    }
  }

  const handleRevealSecret = async (secret: Secret) => {
    if (revealedSecrets[secret.id]) {
      setRevealedSecrets((prev) => {
        const next = { ...prev }
        delete next[secret.id]
        return next
      })
      setRevealError(null)
      return
    }

    if (secret.is_expired) {
      setRevealError('This secret has expired and must be rotated before it can be revealed.')
      return
    }

    if (!masterKey) {
      setRevealError('Enter your master password first to reveal secret content.')
      return
    }

    if (!secret.iv) {
      setRevealError('This secret is missing its decryption IV.')
      return
    }

    setRevealError(null)
    setRevealingSecretId(secret.id)
    try {
      const plaintext = await decryptAESGCM(masterKey, secret.value, secret.iv)
      setRevealedSecrets((prev) => ({
        ...prev,
        [secret.id]: plaintext,
      }))
    } catch {
      setRevealError('Could not decrypt this secret. Check that the correct master password is loaded.')
    } finally {
      setRevealingSecretId(null)
    }
  }

  const handleOpenDeleteModal = (secret: Secret) => {
    setApiError(null)
    setPendingDeleteSecret(secret)
  }

  const handleCloseDeleteModal = () => {
    if (deletingSecretId) {
      return
    }
    setPendingDeleteSecret(null)
  }

  const closeShareModal = () => {
    if (isSharing) {
      return
    }
    setShareTargetSecret(null)
    setShareError(null)
    setSelectedMemberId('')
    setSelectedTeamId('')
    setTeamMembers([])
    setShareScope('member')
    setShareExpiresAtInput('')
  }

  const handleOpenShareModal = (secret: Secret) => {
    if (!user || user.role !== 'tl') {
      return
    }

    if (secret.is_expired) {
      setApiError('This secret has expired and must be rotated before it can be shared.')
      return
    }

    setApiError(null)
    setShareStatus(null)
    setShareError(null)
    setShareTargetSecret(secret)
    setShareScope('member')
    setShareExpiresAtInput('')
    setSelectedMemberId('')

    const teams = user.teams ?? []
    if (teams.length === 0) {
      setSelectedTeamId('')
      setTeamMembers([])
      setShareError('You are not assigned to a team yet. Ask an admin to add you to a team first.')
      return
    }

    setSelectedTeamId(teams[0].id)
  }

  useEffect(() => {
    if (!user || user.role !== 'tl' || !shareTargetSecret || !selectedTeamId) {
      return
    }

    let canceled = false

    const loadSelectedTeamMembers = async () => {
      setIsLoadingTeamMembers(true)
      setTeamMembers([])
      setSelectedMemberId('')
      setShareError(null)

      try {
        const response = await api.get<User[]>('/users/teams/'+selectedTeamId +'/', {
        })

        if (canceled) {
          return
        }

        const members = response.data.filter((member) => member.id !== user.id)
        setTeamMembers(members)
        if (members.length > 0) {
          setSelectedMemberId(members[0].id)
        } else {
          setShareError('No active members found in the selected team.')
        }
      } catch {
        if (canceled) {
          return
        }
        setTeamMembers([])
        setShareError('Could not load team members for the selected team. Please try again.')
      } finally {
        if (!canceled) {
          setIsLoadingTeamMembers(false)
        }
      }
    }

    void loadSelectedTeamMembers()

    return () => {
      canceled = true
    }
  }, [user, shareTargetSecret, selectedTeamId])

  const handleShareSecret = async () => {
    if (!user || !shareTargetSecret) {
      return
    }

    if (!masterKey) {
      setShareError('Enter your master password before sharing a secret.')
      return
    }

    if (!shareTargetSecret.iv) {
      setShareError('This secret is missing its decryption IV and cannot be shared.')
      return
    }

    const recipients =
      shareScope === 'team'
        ? teamMembers
        : teamMembers.filter((member) => member.id === selectedMemberId)

    if (recipients.length === 0) {
      setShareError(
        shareScope === 'team'
          ? 'There are no team members available for sharing.'
          : 'Select a team member to share this secret with.',
      )
      return
    }

    setShareError(null)
    setShareStatus(null)
    setIsSharing(true)

    let plaintext = ''
    try {
      plaintext = await decryptAESGCM(masterKey, shareTargetSecret.value, shareTargetSecret.iv)
    } catch {
      setIsSharing(false)
      setShareError('Could not decrypt this secret for sharing. Check the loaded master password.')
      return
    }

    const sharingExpiresAt = shareExpiresAtInput ? new Date(shareExpiresAtInput) : null
    if (sharingExpiresAt && Number.isNaN(sharingExpiresAt.getTime())) {
      setIsSharing(false)
      setShareError('Invalid expiration date and time.')
      return
    }
    if (sharingExpiresAt && sharingExpiresAt.getTime() <= Date.now()) {
      setIsSharing(false)
      setShareError('Expiration must be in the future.')
      return
    }
    if (!sharingExpiresAt) {
      setIsSharing(false)
      setShareError('Choose an expiration date and time — sharing without an expiry is not allowed.')
      return
    }

    const secretExpiresAt = shareTargetSecret.expires_at ? new Date(shareTargetSecret.expires_at) : null
    if (secretExpiresAt && !Number.isNaN(secretExpiresAt.getTime()) && sharingExpiresAt.getTime() > secretExpiresAt.getTime()) {
      setIsSharing(false)
      setShareError(
        `Expiration cannot be later than this secret's own rotation deadline (${secretExpiresAt.toLocaleString()}).`,
      )
      return
    }

    try {
      const results = await Promise.allSettled(
        recipients.map(async (recipient) => {
          const recipientPublicKey = await importPublicKeyFromPEM(recipient.pub_key)
          const encryptedPayload = await encryptWithPublicKey(recipientPublicKey, plaintext)

          return api.post(
            `/secrets/${shareTargetSecret.id}/share`,
            {
              sharing_with: recipient.id,
              cipher_text: encryptedPayload,
              sharing_expires_at: sharingExpiresAt.toISOString(),
            },
            {},
          )
        }),
      )

      const successCount = results.filter((result) => result.status === 'fulfilled').length
      const failedCount = results.length - successCount

      const backendDetail = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => (axios.isAxiosError(result.reason) ? result.reason.response?.data?.detail : null))
        .find((detail): detail is string => typeof detail === 'string')

      if (successCount === 0) {
        setShareError(backendDetail ?? 'Sharing failed for all selected recipients.')
        return
      }

      if (failedCount > 0) {
        setShareStatus(
          `Shared with ${successCount} member(s). ${failedCount} share request(s) failed${backendDetail ? `: ${backendDetail}` : '.'}`,
        )
      } else {
        setShareStatus(
          shareScope === 'team'
            ? `Secret shared with selected team (${successCount} members).`
            : 'Secret shared with selected member.',
        )
      }

      await fetchOwnedSharedSecrets(user, true)

      closeShareModal()
    } catch {
      setShareError('Could not complete sharing. Please try again.')
    } finally {
      setIsSharing(false)
    }
  }

  const handleRevokeSharedSecret = async (sharedSecretId: string) => {
    if (!user || user.role !== 'tl') {
      return
    }

    setOwnedSharedSecretsError(null)
    setRevokeStatus(null)
    setRevokingSharedSecretId(sharedSecretId)

    try {
      await api.delete(`/secrets/shared/${sharedSecretId}`, {})

      setOwnedSharedSecrets((prev) => prev.filter((sharedSecret) => sharedSecret.id !== sharedSecretId))
      setRevokeStatus('Sharing revoked successfully.')
    } catch {
      setOwnedSharedSecretsError('Could not revoke this sharing entry. Please try again.')
    } finally {
      setRevokingSharedSecretId(null)
    }
  }

  const handleRevealReceivedSecret = async (sharedSecret: ReceivedSharedSecret) => {
    if (!user) {
      setReceivedRevealError('Please sign in again.')
      return
    }

    if (revealedReceivedSecrets[sharedSecret.id]) {
      setRevealedReceivedSecrets((prev) => {
        const next = { ...prev }
        delete next[sharedSecret.id]
        return next
      })
      setReceivedRevealError(null)
      return
    }

    if (!masterKey) {
      setReceivedRevealError('Enter your master password first to reveal shared secret content.')
      return
    }

    setReceivedRevealError(null)
    setRevealingReceivedSecretId(sharedSecret.id)

    try {
      const encryptedPrivateKey = await loadPrivateKeyBackup(user.id)
      if (!encryptedPrivateKey?.ciphertext || !encryptedPrivateKey?.salt || !encryptedPrivateKey?.iv) {
        setReceivedRevealError('Encrypted private key is missing or incomplete. Import a valid backup and try again.')
        return
      }

      const privateKey = await decryptPrivateKeyFromBlob(masterKey, encryptedPrivateKey)
      const response = await api.get<SharedSecretPayloadResponse>(`/secrets/shared/${sharedSecret.id}`, {})
      const plaintext = await decryptWithPrivateKey(privateKey, response.data.cipher_text)

      setRevealedReceivedSecrets((prev) => ({
        ...prev,
        [sharedSecret.id]: plaintext,
      }))
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail
        setReceivedRevealError(detail ?? 'Could not load or decrypt this shared secret.')
      } else {
        setReceivedRevealError('Could not load or decrypt this shared secret.')
      }
    } finally {
      setRevealingReceivedSecretId(null)
    }
  }

  const handleMasterPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !masterPassword.trim()) return

    setMasterPasswordError(null)
    setApiError(null)
    try {
      const dict = await loadPrivateKeyBackup(user.id)
      if (!dict || !dict.salt) {
        setMasterPasswordError('Failed to load salt — please try again')
        return
      }

      const key = await deriveKeyFromPassword(masterPassword, base64ToUint8Array(dict.salt))
      setMasterKey(key)
      setMasterPassword('')
      setShowMasterPasswordModal(false)
    } catch (err) {
      setHasIndexedDbBackup(false)
      setMasterPasswordError('Failed to derive encryption key')
    }
  }

  const handleLogout = async (keepPrivateKeyBackup: boolean) => {
    setShowLogoutPrompt(false)
    await logout({ keepPrivateKeyBackup })
    navigate('/login')
  }

  const handleOpenBackupImport = async () => {
    if (!user) {
      return
    }

    setBackupImportStatus(null)
    setApiError(null)

    try {
      const existing = await loadPrivateKeyBackup(user.id)
      const hasBackup = Boolean(existing?.ciphertext && existing?.salt && existing?.iv)
      setHasIndexedDbBackup(hasBackup)
      if (hasBackup) {
        setBackupImportStatus('Existing backup will be replaced after you choose a JSON file.')
      }
      fileInputRef.current?.click()
    } catch {
      setBackupImportStatus('Could not check IndexedDB status. Please try again.')
    }
  }

  const handleBackupFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''

    if (!user || !file) {
      return
    }

    setBackupImportStatus(null)
    setApiError(null)

    try {
      const parsed = backupSchema.parse(JSON.parse(await file.text()))
      const ciphertext = parsed.encryptedPrivateKey ?? parsed.ciphertext ?? ''

      await savePrivateKeyBackup(user.id, {
        ciphertext,
        iv: parsed.iv,
        salt: parsed.salt,
      })

      setHasIndexedDbBackup(true)
    } catch (error) {
      if (error instanceof z.ZodError) {
        setHasIndexedDbBackup(false)
        setBackupImportStatus(error.issues[0]?.message ?? 'Invalid backup JSON file format.')
        return
      }
      setHasIndexedDbBackup(false)
      setBackupImportStatus('Failed to import backup file. Please verify the JSON content and try again.')
    }
  }

  if (!user) {
    return null
  }

  const userTeams = user.teams ?? []
  const minShareExpiry = toDateTimeLocalValue(new Date(Date.now() + 60_000))

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-100 px-4 py-8 text-slate-900">
      {pendingDeleteSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Delete Secret</h2>
              <button
                type="button"
                onClick={handleCloseDeleteModal}
                disabled={Boolean(deletingSecretId)}
                className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Delete <span className="font-semibold text-slate-800">{pendingDeleteSecret.label}</span>? This action cannot be undone.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseDeleteModal}
                disabled={Boolean(deletingSecretId)}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteSecret()}
                disabled={Boolean(deletingSecretId)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
              >
                <Trash2 size={14} />
                {deletingSecretId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {shareTargetSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Share Secret</h2>
              <button
                type="button"
                onClick={closeShareModal}
                disabled={isSharing}
                className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-slate-600">
              Share <span className="font-semibold text-slate-800">{shareTargetSecret.label}</span> with one member or your whole team.
            </p>

            {userTeams.length > 1 && (
              <div className="mt-4 flex flex-col gap-1">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Team</label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  disabled={isSharing}
                  className={inputCls}
                >
                  {userTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {userTeams.length === 1 && (
              <p className="mt-4 text-xs text-slate-600">
                Team: <span className="font-medium text-slate-800">{userTeams[0].name}</span>
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShareScope('member')}
                disabled={isSharing}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60',
                  shareScope === 'member'
                    ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                Share with member
              </button>
              <button
                type="button"
                onClick={() => setShareScope('team')}
                disabled={isSharing}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60',
                  shareScope === 'team'
                    ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                Share with whole team
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Expires at (required)</label>
              <input
                type="datetime-local"
                value={shareExpiresAtInput}
                min={minShareExpiry}
                max={
                  shareTargetSecret.expires_at && !Number.isNaN(new Date(shareTargetSecret.expires_at).getTime())
                    ? toDateTimeLocalValue(new Date(shareTargetSecret.expires_at))
                    : undefined
                }
                onChange={(e) => setShareExpiresAtInput(e.target.value)}
                disabled={isSharing}
                className={inputCls}
              />
              {shareTargetSecret.expires_at && (
                <span className="text-[11px] text-slate-500">
                  Cannot be shared past this secret's rotation deadline: {formatShareExpiry(shareTargetSecret.expires_at)}
                </span>
              )}
            </div>

            {shareScope === 'member' && (
              <div className="mt-4 flex flex-col gap-1">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Team member</label>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  disabled={isLoadingTeamMembers || isSharing || teamMembers.length === 0}
                  className={inputCls}
                >
                  {teamMembers.length === 0 ? (
                    <option value="">No members available</option>
                  ) : (
                    teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.username} ({member.role.toUpperCase()})
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}

            {isLoadingTeamMembers && <p className="mt-3 text-xs text-slate-500">Loading team members...</p>}
            {shareError && <p className="mt-3 text-xs text-red-600">{shareError}</p>}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeShareModal}
                disabled={isSharing}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleShareSecret()}
                disabled={isSharing || isLoadingTeamMembers || teamMembers.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-700 transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Users size={14} />
                {isSharing ? 'Sharing...' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMasterPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Master Password</h2>
              <button
                type="button"
                onClick={() => {
                  setShowMasterPasswordModal(false)
                  setMasterPasswordError(null)
                  setMasterPassword('')
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-600">Enter your master password to encrypt secrets.</p>
            <form onSubmit={handleMasterPasswordSubmit} className="flex flex-col gap-3">
              <input
                type="password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="Master password"
                className={cn(inputCls, 'h-11 py-0')}
              />
              {masterPasswordError && <span className="text-[11px] text-red-600">{masterPasswordError}</span>}
              <button
                type="submit"
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                  'bg-cyan-500 text-slate-950 hover:bg-cyan-400',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                Unlock
              </button>
            </form>
          </div>
        </div>
      )}
      <LogoutPrivateKeyPrompt
        open={showLogoutPrompt}
        onCancel={() => setShowLogoutPrompt(false)}
        onSelect={(keepPrivateKeyBackup) => void handleLogout(keepPrivateKeyBackup)}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.14),transparent_42%),radial-gradient(circle_at_85%_10%,rgba(148,163,184,0.12),transparent_40%),linear-gradient(to_bottom,#f8fbff,#eef4fb)]" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">SecureVault</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Secret Workspace</h1>
              <p className="mt-1 text-sm text-slate-600">Add and manage encrypted secrets in your personal collection.</p>
            </div>
            <div className="flex items-stretch gap-3 self-end">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={(e) => void handleBackupFileSelected(e)}
                className="hidden"
              />

              <div className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">{user.username}</span>
                <span className="text-slate-400">•</span>
                <span className="uppercase tracking-wide">{user.role}</span>
              </div>

              <button
                type="button"
                onClick={() => void handleOpenBackupImport()}
                className={cn(
                  'inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors',
                  hasIndexedDbBackup
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <Lock size={14} />
                {hasIndexedDbBackup ? 'Private key loaded' : 'Private key not loaded'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiError(null)
                  setMasterPasswordError(null)
                  setShowMasterPasswordModal(true)
                }}
                className={cn(
                  'inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors',
                  masterKey
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <KeyRound size={14} />
                {masterKey ? 'Master password loaded' : 'Enter master password'}
              </button>

              <button
                type="button"
                onClick={() => setShowLogoutPrompt(true)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          </div>
          {backupImportStatus && (
            <p className="mt-3 text-xs text-slate-600">{backupImportStatus}</p>
          )}
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur lg:col-span-5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                {editingSecretId ? 'Edit Secret' : 'New Secret'}
              </h2>
              <p className="mt-1 inline-flex items-center gap-2 text-xs text-slate-600">
                <Lock size={12} />
                Value is encrypted client-side before it is sent.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Label</label>
                <input
                  {...register('label')}
                  placeholder="e.g. GitHub API Token"
                  className={inputCls}
                />
                {errors.label?.message && <span className="text-[11px] text-red-600">{errors.label.message}</span>}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Type</label>
                <select {...register('type')} className={inputCls}>
                  <option value="password">Password</option>
                  <option value="api_key">API Key</option>
                  <option value="certificate">Certificate</option>
                  <option value="other">Other</option>
                </select>
                {errors.type?.message && <span className="text-[11px] text-red-600">{errors.type.message}</span>}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Secret Value</label>
                <textarea
                  {...register('value')}
                  rows={5}
                  placeholder="Paste secret value"
                  className={inputCls}
                />
                {errors.value?.message && <span className="text-[11px] text-red-600">{errors.value.message}</span>}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isPreparingEdit}
                className={cn(
                  'mt-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                  'bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:shadow-[0_0_16px_rgba(34,211,238,0.35)]',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {editingSecretId ? <Pencil size={15} /> : <Plus size={15} />}
                {isPreparingEdit
                  ? 'Preparing edit...'
                  : isSubmitting
                    ? editingSecretId
                      ? 'Updating...'
                      : 'Adding...'
                    : editingSecretId
                      ? 'Update secret'
                      : 'Add secret'}
              </button>

              {editingSecretId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancel edit
                </button>
              )}

              {apiError && <p className="text-sm text-red-600">{apiError}</p>}
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur lg:col-span-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Your Collection</h2>
              <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {secrets.length} items
              </span>
            </div>

            {revealError && <p className="mt-3 text-sm text-red-600">{revealError}</p>}
            {shareStatus && <p className="mt-3 text-sm text-emerald-700">{shareStatus}</p>}

            {isLoading ? (
              <p className="mt-3 text-sm text-slate-500">Loading secrets...</p>
            ) : secrets.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No secrets yet. Add your first one from the form.
              </p>
            ) : (
              <ul className="mt-4 flex max-h-[30rem] flex-col gap-3 overflow-y-auto pr-1">
                {secrets.map((secret) => (
                  <li
                    key={secret.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800">{secret.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {TYPE_ICON[secret.type]}
                          {secret.type.replace('_', ' ')}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleRevealSecret(secret)}
                          disabled={Boolean(secret.is_expired) && !revealedSecrets[secret.id]}
                          title={secret.is_expired ? 'Expired secrets must be rotated before they can be revealed.' : undefined}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {revealedSecrets[secret.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                          {revealedSecrets[secret.id]
                            ? 'Hide'
                            : revealingSecretId === secret.id
                              ? 'Revealing...'
                              : 'Reveal'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStartEdit(secret)}
                          disabled={deletingSecretId === secret.id || Boolean(secret.is_expired)}
                          title={secret.is_expired ? 'Expired secrets can not be edited.' : undefined}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                        {user.role === 'tl' && (
                          <button
                            type="button"
                            onClick={() => void handleOpenShareModal(secret)}
                            disabled={deletingSecretId === secret.id || Boolean(secret.is_expired)}
                            title={secret.is_expired ? 'Expired secrets must be rotated before they can be shared.' : undefined}
                            className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-medium text-cyan-700 transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Send size={12} />
                            Share
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenDeleteModal(secret)}
                          disabled={deletingSecretId === secret.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 size={12} />
                          {deletingSecretId === secret.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-2">
                      <RotationBadge secret={secret} />
                    </div>
                    <p className="mt-2 text-[11px] font-mono text-slate-500">Encrypted blob stored</p>
                    {revealedSecrets[secret.id] && (
                      <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 font-mono text-xs text-slate-800 break-all">
                        {revealedSecrets[secret.id]}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {user.role === 'tl' && (
          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Shared By You</h2>
              <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {ownedSharedSecrets.length} active share(s)
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">Review all active shared secrets and revoke access when needed.</p>

            {revokeStatus && <p className="mt-3 text-sm text-emerald-700">{revokeStatus}</p>}
            {ownedSharedSecretsError && <p className="mt-3 text-sm text-red-600">{ownedSharedSecretsError}</p>}

            {isLoadingOwnedSharedSecrets ? (
              <p className="mt-3 text-sm text-slate-500">Loading shared secrets...</p>
            ) : ownedSharedSecrets.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                You have not shared any secrets yet.
              </p>
            ) : (
              <ul className="mt-4 flex max-h-[26rem] flex-col gap-3 overflow-y-auto pr-1">
                {ownedSharedSecrets.map((sharedSecret) => (
                  <li key={sharedSecret.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{sharedSecret.secret_label}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Shared with <span className="font-medium text-slate-800">{sharedSecret.sharing_with_username}</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Expires: {formatShareExpiry(sharedSecret.sharing_expires_at)}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {TYPE_ICON[sharedSecret.secret_type]}
                          {sharedSecret.secret_type.replace('_', ' ')}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleRevokeSharedSecret(sharedSecret.id)}
                          disabled={revokingSharedSecretId === sharedSecret.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <X size={12} />
                          {revokingSharedSecretId === sharedSecret.id ? 'Revoking...' : 'Revoke'}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Shared With You</h2>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {receivedSharedSecrets.length} active share(s)
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">These are secrets shared with your account by other members.</p>

          {receivedSharedSecretsError && <p className="mt-3 text-sm text-red-600">{receivedSharedSecretsError}</p>}
          {receivedRevealError && <p className="mt-3 text-sm text-red-600">{receivedRevealError}</p>}

          {isLoadingReceivedSharedSecrets ? (
            <p className="mt-3 text-sm text-slate-500">Loading shared secrets...</p>
          ) : receivedSharedSecrets.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              No active secrets have been shared with you.
            </p>
          ) : (
            <ul className="mt-4 flex max-h-[26rem] flex-col gap-3 overflow-y-auto pr-1">
              {receivedSharedSecrets.map((sharedSecret) => (
                <li key={sharedSecret.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{sharedSecret.secret_label}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Shared by <span className="font-medium text-slate-800">{sharedSecret.owner_username}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Expires: {formatShareExpiry(sharedSecret.sharing_expires_at)}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {TYPE_ICON[sharedSecret.secret_type]}
                        {sharedSecret.secret_type.replace('_', ' ')}
                      </span>

                      <button
                        type="button"
                        onClick={() => void handleRevealReceivedSecret(sharedSecret)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        {revealedReceivedSecrets[sharedSecret.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                        {revealedReceivedSecrets[sharedSecret.id]
                          ? 'Hide'
                          : revealingReceivedSecretId === sharedSecret.id
                            ? 'Revealing...'
                            : 'Reveal'}
                      </button>
                    </div>
                  </div>

                  {revealedReceivedSecrets[sharedSecret.id] && (
                    <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 font-mono text-xs text-slate-800 break-all">
                      {revealedReceivedSecrets[sharedSecret.id]}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30'