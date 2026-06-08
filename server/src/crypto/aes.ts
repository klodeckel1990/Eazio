import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { CipherGCMTypes } from 'node:crypto'
import { env } from '../config/env.js'

const ALGO: CipherGCMTypes = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16
const KEY = Buffer.from(env.MASTER_KEY, 'base64')

/** Encrypts a UTF-8 string. Output = base64(iv | authTag | ciphertext). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, KEY, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

/** Reverses encrypt(). Throws if the auth tag does not verify. */
export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
