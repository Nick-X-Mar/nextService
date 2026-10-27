// Utility for persisting form data across page navigation

export interface ServiceFormData {
  category: string
  description: string
  brand: string
  model: string
  isBrandOther: boolean
  isModelOther: boolean
  customBrand: string
  customModel: string
  // Car specifications - Page 2 (Basic info)
  modelYear: string
  vinNumber: string
  engineCC: string
  // Car specifications - Page 3 (Advanced specs)
  // 'petrol' | 'diesel' from the form; a saved vehicle can also carry hybrid, lpg, …
  fuelType: string
  isAutomatic: boolean
  is4x4: boolean
  isTurbo: boolean
  engineNumber: string
  estimatedPrice: number | null
  // Original vehicle tracking (for detecting changes)
  originalVehicleId?: string
  originalVehicleLicensePhotoUrl?: string
  originalVehicleData?: {
    brand: string
    model: string
    modelYear?: string
    engineCC?: string
    fuelType?: string
    isAutomatic?: boolean
    is4x4?: boolean
    isTurbo?: boolean
    vinNumber?: string
    engineNumber?: string
    licensePlate?: string
    color?: string
  }
  /**
   * Idempotency key for this draft, sent with the submit. A retried or double-fired
   * submit of the same draft carries the same key, and the API stores it only once.
   */
  submissionId?: string
  /** What `submissionId` was minted for — see getSubmissionId. */
  submissionFingerprint?: string
  /**
   * Who the draft belongs to: the signed-in user's id, or this tab's guestOwner(). The draft lives
   * in the browser, which is often shared, and outlives the session that wrote it.
   */
  owner?: string
  // Note: File objects are handled separately since they can't be serialized to localStorage
}

const GUEST_OWNER_KEY = 'nextservice-guest-owner'

/**
 * The owner of a draft written by someone who is not signed in: one id per tab,
 * kept in sessionStorage. A single shared "guest" value let the next anonymous
 * visitor on the same browser inherit the VIN and engine number the last one
 * typed; a new tab or a new visit now starts as a different guest, while step 1
 * → step 2 and a reload stay in the same tab and keep their draft.
 */
export const guestOwner = (): string => {
  try {
    let id = sessionStorage.getItem(GUEST_OWNER_KEY)
    if (!id) {
      id = `guest:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
      sessionStorage.setItem(GUEST_OWNER_KEY, id)
    }
    return id
  } catch {
    // Storage blocked: every visit is the same anonymous guest, as before.
    return 'guest'
  }
}

/**
 * Step 1 as the start of a new request. A plain link to /car-details/ resumes whatever
 * draft the browser holds, which is right for "Επιστροφή" from step 2 and wrong for a
 * "Στείλε αίτημα" button on a content page.
 */
export const NEW_REQUEST_HREF = '/car-details/?new=1'

const STORAGE_KEY = 'nextservice-form-data'

export const saveFormData = (data: Partial<ServiceFormData>) => {
  try {
    const existingData = loadFormData()
    const updatedData = { ...existingData, ...data }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData))
  } catch (error) {
    console.error('Failed to save form data:', error)
  }
}

export const loadFormData = (): ServiceFormData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('Failed to load form data:', error)
  }
  
  // Return default values if no data or error
  return {
    category: '',
    description: '',
    brand: '',
    model: '',
    isBrandOther: false,
    isModelOther: false,
    customBrand: '',
    customModel: '',
    modelYear: '',
    vinNumber: '',
    engineCC: '',
    fuelType: '',
    isAutomatic: false,
    is4x4: false,
    isTurbo: false,
    engineNumber: '',
    estimatedPrice: null,
    originalVehicleId: undefined,
    originalVehicleLicensePhotoUrl: undefined,
    originalVehicleData: undefined
  }
}

export const clearFormData = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear form data:', error)
  }
} 

/**
 * Begins a fresh request draft. Every entry point that starts a *new* request (the
 * hero, the category modal, a hot deal, the profile's "Νέο Αίτημα", the site's
 * "Στείλε αίτημα" links via NEW_REQUEST_HREF) goes through here, so nothing from the
 * last request — its description, VIN, saved-vehicle link or idempotency key — leaks
 * into the next one.
 */
export const startNewRequest = (data: Partial<ServiceFormData>) => {
  clearFormData()
  saveFormData(data)
}

/**
 * What ties a draft to one person's car rather than to a car model: the saved-vehicle
 * link, the VIN and engine number, the άδεια photo. Spread into saveFormData to drop
 * them — when the customer switches to another car, or the draft turns out to be
 * someone else's.
 */
export const DETACHED_VEHICLE: Partial<ServiceFormData> = {
  vinNumber: '',
  engineNumber: '',
  originalVehicleId: undefined,
  originalVehicleLicensePhotoUrl: undefined,
  originalVehicleData: undefined,
}

const hasStoredDraft = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Makes the stored draft `owner`'s, once the session is confirmed. A draft somebody
 * else left behind — another account on a shared browser, a guest before them, or a
 * draft from before drafts had an owner — keeps the job and the car model but loses
 * everything identifying that person's car (DETACHED_VEHICLE), and its idempotency key:
 * submitted under that key it would come back "already sent" with their request.
 *
 * Several "Στείλε αίτημα" links land on step 1 without starting a new draft, and
 * admin-edited copy can keep linking that way, so this is the check that holds.
 * Returns true when it dropped something, so a screen can reset what it shows.
 */
export const claimFormData = (owner: string): boolean => {
  if (!hasStoredDraft() || loadFormData().owner === owner) return false
  saveFormData({ ...DETACHED_VEHICLE, submissionId: undefined, submissionFingerprint: undefined, owner })
  return true
}

/**
 * The person filling the draft just signed in from it (the step-2 login), so it is
 * theirs as it stands — numbers included. Never creates a draft.
 */
export const adoptFormData = (owner: string) => {
  if (hasStoredDraft()) saveFormData({ owner })
}

/**
 * A v4 UUID. `crypto.randomUUID` is missing on iOS Safari before 15.4 and on any page
 * served over plain http, where calling it threw and left the submit spinning forever;
 * `getRandomValues` is there in both.
 */
const newUuid = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** A short, stable digest of a request body (FNV-1a). Only ever compared for equality. */
const fingerprintOf = (body: Record<string, unknown>): string => {
  const { password: _password, submissionId: _submissionId, ...rest } = body
  const text = JSON.stringify(rest)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

/**
 * The idempotency key for submitting `body`. A retry of the same body — a double tap,
 * a resend after the answer was lost — reuses it, and the API stores the request once.
 * A body that changed since the last attempt gets a new key: under the old one the
 * server would answer "already sent" with the earlier version and the edit would vanish.
 */
export const getSubmissionId = (body: Record<string, unknown>): string => {
  const fingerprint = fingerprintOf(body)
  const draft = loadFormData()
  if (draft.submissionId && draft.submissionFingerprint === fingerprint) return draft.submissionId
  const id = newUuid()
  saveFormData({ submissionId: id, submissionFingerprint: fingerprint })
  return id
}
