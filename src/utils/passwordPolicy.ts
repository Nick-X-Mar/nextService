/**
 * Password rules shared by client forms and server routes.
 *
 * Kept in its own dependency-free module on purpose: the form components that
 * need this constant are client components, and importing it from
 * `passwordService` would drag bcryptjs — a server-only, CommonJS package that
 * tree-shaking does not reliably strip — into the browser bundle.
 */

/**
 * Minimum length for a NEW password (registration and reset).
 *
 * Deliberately not enforced on login: accounts created before this was raised
 * from 6 still have shorter passwords, and rejecting them at the login form
 * would lock those people out of their own accounts. The server only compares
 * the hash, so a short existing password keeps working until its owner changes
 * it.
 */
export const MIN_PASSWORD_LENGTH = 8
