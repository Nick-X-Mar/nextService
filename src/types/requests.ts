import type { CompletionAmounts, CompletionOutcome } from './reviews'
import { ServiceRequestStatus } from './statuses'

/**
 * Service Request Interface
 * 
 * Shared interface for service requests used across the application.
 * This ensures consistency in how service requests are represented.
 */
export interface ServiceRequest {
  id: string
  clientId: string
  vehicleId: string
  category: string
  description: string
  status: ServiceRequestStatus
  estimatedCost?: number
  photoUrls: string[]
  photos: Array<{
    id: string
    s3Url: string
    s3Key: string
    originalName: string
    fileSize: number
    contentType: string
    description?: string
    uploadedAt: string
  }>
  createdAt: string
  updatedAt: string
  vehicle?: {
    brand: string
    model: string
    modelYear?: string
    engineCC?: string
    fuelType?: string
    isAutomatic?: boolean
    is4x4?: boolean
    isTurbo?: boolean
    licensePlate?: string
    engineNumber?: string
    vinNumber?: string
    /** Presigned URL for the άδεια κυκλοφορίας photo — short-lived, never persisted. */
    licensePhotoUrl?: string | null
  }
  client?: {
    firstName: string
    lastName?: string
    phoneNumber?: string
  }
  clientAvailabilityDates?: string[]
  acceptedOfferId?: string
  /** The garage whose offer was accepted — the only one that may still chat. */
  acceptedGarageId?: string | null
  appointmentDate?: string
  /** 'HH:MM'. Null on appointments booked before hourly slots existed. */
  appointmentTime?: string | null
  appointmentPrice?: number
  paymentIntentId?: string
  depositAmount?: number
  remainingAmount?: number
  cancelledAt?: string

  // ── Completion ───────────────────────────────────────────────────────────
  // Written when the garage confirms the job after the appointment. Until then
  // a request sits in APPOINTMENT even once the slot has passed; nothing in
  // the app moved a request to COMPLETED before this existed.
  completedAt?: string
  completedBy?: 'garage' | 'admin'
  completionOutcome?: CompletionOutcome
  completionNotes?: string
  /** When the garage was first asked to confirm. Set by the sweeper. */
  completionPromptedAt?: string
  /**
   * What the garage says it actually charged, as opposed to `appointmentPrice`,
   * which is only what it quoted. Commission is calculated on `net`.
   */
  finalAmounts?: CompletionAmounts
}

