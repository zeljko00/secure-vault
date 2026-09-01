import { bufToBase64, base64ToUint8Array, toArrayBuffer } from './utils'

const ENC = new TextEncoder()
const DEC = new TextDecoder()

export type EncryptedPrivateKeyBlob = {
  ciphertext: string
  iv: string
  salt: string
}

const MASTER_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*+-='

export function generateMasterPassword(length = 24): string {
  const randomBytes = window.crypto.getRandomValues(new Uint8Array(length))
  return Array.from(randomBytes, (byte) => MASTER_PASSWORD_ALPHABET[byte % MASTER_PASSWORD_ALPHABET.length]).join('')
}

/* RSA-OAEP key pair generator */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // extractable
    ['encrypt', 'decrypt'], // public key can encrypt, private key can decrypt
  )
}

export async function exportPublicKeyToPEM(publicKey: CryptoKey): Promise<string> {
  const spki = await window.crypto.subtle.exportKey('spki', publicKey) // key in Subject Public Key Info format
  const base64 = bufToBase64(spki)
  // split into lines of 64 characters and wrap with PEM header/footer
  return `-----BEGIN PUBLIC KEY-----\n${base64.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`
}

export async function exportPrivateKeyToPEM(privateKey: CryptoKey): Promise<string> {
  const pkcs8 = await window.crypto.subtle.exportKey('pkcs8', privateKey)
  const base64 = bufToBase64(pkcs8)
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`
}

export function generateSalt(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(16))
}

/* PBKDF2 key derivation */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const saltBuffer = toArrayBuffer(salt)
  const raw = await window.crypto.subtle.importKey(
    'raw', ENC.encode(password), 'PBKDF2', false, ['deriveKey'],
  )
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuffer, iterations: 310_000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/* AES-GCM encrypt */
export async function encryptAESGCM(
  key: CryptoKey,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    ENC.encode(plaintext),
  )
  return {
    ciphertext: bufToBase64(ciphertext),
    iv: bufToBase64(iv),
  }
}

export async function encryptPrivateKeyForStorage(
  privateKey: CryptoKey,
  password: string,
): Promise<EncryptedPrivateKeyBlob> {
  const privateKeyPem = await exportPrivateKeyToPEM(privateKey)
  const salt = generateSalt()
  const encryptionKey = await deriveKeyFromPassword(password, salt)
  // Encrypt the private key PEM with AES-GCM using the key derived from the password
  const encrypted = await encryptAESGCM(encryptionKey, privateKeyPem)

  return {
    ...encrypted,
    salt: bufToBase64(salt),
  }
}

/* IndexedDB */
const DB_NAME = 'keystore'
const STORE   = 'keys'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

/* Store encrypted private-key blob in IndexedDB */
export async function storeEncryptedPrivateKey(
  userId: string,
  encryptedBlob: EncryptedPrivateKeyBlob,
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(encryptedBlob, `key_${userId}`)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

export async function loadEncryptedPrivateKey(
  userId: string,
): Promise<EncryptedPrivateKeyBlob | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(`key_${userId}`)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror   = () => reject(req.error)
  })
}

// =======================================================

export async function decryptAESGCM(
  key: CryptoKey,
  ciphertext: string,
  iv: string,
): Promise<string> {
  const ivBytes = base64ToUint8Array(iv)
  const ciphertextBytes = base64ToUint8Array(ciphertext)
  const pt = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
    key,
    toArrayBuffer(ciphertextBytes),
  )
  return DEC.decode(pt)
}

export async function encryptWithPublicKey(
  publicKey: CryptoKey,
  plaintext: string,
): Promise<string> {
  const ct = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    ENC.encode(plaintext),
  )
  return bufToBase64(ct)
}

export async function decryptWithPrivateKey(
  privateKey: CryptoKey,
  ciphertext: string,
): Promise<string> {
  const ciphertextBytes = base64ToUint8Array(ciphertext)
  const pt = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    toArrayBuffer(ciphertextBytes),
  )
  return DEC.decode(pt)
}