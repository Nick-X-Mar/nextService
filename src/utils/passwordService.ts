import bcrypt from 'bcryptjs'
import { phonePasswordCandidates } from '@/utils/phone'

const SALT_ROUNDS = 12

/**
 * Server-only. The length policy lives in `passwordPolicy.ts` instead, so the
 * client forms can share it without pulling bcryptjs into the browser bundle.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS)
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash)
}

/**
 * For a user typing their own password back (login, merge, GDPR export/delete).
 * A client who signed up through the request form has their mobile as their
 * password, stored as the national number (`6912345678`), and types it however
 * they write it — so a failed compare is retried with those other spellings.
 */
export async function verifyAccountPassword(plaintext: string, hash: string): Promise<boolean> {
  if (await verifyPassword(plaintext, hash)) return true
  for (const candidate of phonePasswordCandidates(plaintext)) {
    if (await verifyPassword(candidate, hash)) return true
  }
  return false
}
