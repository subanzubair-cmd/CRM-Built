import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

/**
 * AES-256-GCM encryption for secret fields stored in DB.
 *
 * The key is derived from CONFIG_ENCRYPTION_KEY or (as fallback) AUTH_SECRET.
 * Output format: `iv:ciphertext:authTag` (all base64, joined with `:`)
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const secret =
    process.env.CONFIG_ENCRYPTION_KEY ??
    process.env.AUTH_SECRET ??
    'dev-fallback-secret-change-in-production'
  // Derive a 32-byte key from the provided secret via SHA-256
  return createHash('sha256').update(secret).digest()
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return ''
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [
    iv.toString('base64'),
    encrypted.toString('base64'),
    authTag.toString('base64'),
  ].join(':')
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ''
  try {
    const parts = ciphertext.split(':')
    if (parts.length !== 3) return ''
    const iv = Buffer.from(parts[0], 'base64')
    const encrypted = Buffer.from(parts[1], 'base64')
    const authTag = Buffer.from(parts[2], 'base64')
    if (authTag.length !== TAG_LENGTH) return ''
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8')
  } catch (err) {
    console.error('[crypto] decrypt failed:', err)
    return ''
  }
}

/**
 * Mask a secret value for display. Shows `••••••••` when value is present.
 * Returns empty string when no value.
 */
export function maskSecret(value: string | null | undefined): string {
  return value ? '••••••••' : ''
}

/**
 * Mask a non-secret ID (like Account SID) showing only first 8 characters.
 */
export function maskId(value: string | null | undefined): string {
  if (!value) return ''
  if (value.length <= 8) return value
  return `${value.slice(0, 8)}…`
}
