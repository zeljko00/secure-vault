/**
 * crypto.ts — the ONLY file allowed to call window.crypto.subtle.
 *
 * Security rules:
 * - Never log decrypted values or private keys.
 * - Private keys are stored in IndexedDB only, encrypted with the master-key.
 * - Master password never leaves this module.
 */

const ENC = new TextEncoder()
const DEC = new TextDecoder()

// ── PBKDF2 key derivation ─────────────────────────────────────
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const saltBuffer = toArrayBuffer(salt)
  const raw = await crypto.subtle.importKey(
    'raw', ENC.encode(password), 'PBKDF2', false, ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuffer, iterations: 310_000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}

// ── AES-GCM encrypt / decrypt ─────────────────────────────────
export async function encryptAESGCM(
  key: CryptoKey,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    ENC.encode(plaintext),
  )
  return {
    ciphertext: bufToBase64(ct),
    iv: bufToBase64(iv),
  }
}

export async function decryptAESGCM(
  key: CryptoKey,
  ciphertext: string,
  iv: string,
): Promise<string> {
  const ivBytes = base64ToUint8Array(iv)
  const ciphertextBytes = base64ToUint8Array(ciphertext)
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
    key,
    toArrayBuffer(ciphertextBytes),
  )
  return DEC.decode(pt)
}

// ── RSA-OAEP key pair ─────────────────────────────────────────
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // extractable — needed to export public key for server
    ['encrypt', 'decrypt'],
  )
}

export async function exportPublicKeyPEM(publicKey: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', publicKey)
  const b64 = bufToBase64(spki)
  return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`
}

export async function encryptWithPublicKey(
  publicKey: CryptoKey,
  plaintext: string,
): Promise<string> {
  const ct = await crypto.subtle.encrypt(
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
  const pt = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    toArrayBuffer(ciphertextBytes),
  )
  return DEC.decode(pt)
}

// ── Private key storage (IndexedDB) ──────────────────────────
const DB_NAME = 'sv_keystore'
const STORE   = 'keys'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

/** Store encrypted private-key blob in IndexedDB */
export async function storeEncryptedPrivateKey(
  userId: number,
  encryptedBlob: { ciphertext: string; iv: string },
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(encryptedBlob, `privkey_${userId}`)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

export async function loadEncryptedPrivateKey(
  userId: number,
): Promise<{ ciphertext: string; iv: string } | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(`privkey_${userId}`)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror   = () => reject(req.error)
  })
}

// ── Helpers ───────────────────────────────────────────────────
function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer)))
}

function base64ToUint8Array(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
