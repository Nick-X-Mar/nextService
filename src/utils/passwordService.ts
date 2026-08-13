import bcrypt from 'bcryptjs'

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
