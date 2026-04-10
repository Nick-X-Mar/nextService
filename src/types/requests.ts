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
  }
  client?: {
    firstName: string
    lastName?: string
    phoneNumber?: string
  }
  clientAvailabilityDates?: string[]
  acceptedOfferId?: string
  appointmentDate?: string
  appointmentPrice?: number
  paymentIntentId?: string
  depositAmount?: number
  remainingAmount?: number
  cancelledAt?: string
}

