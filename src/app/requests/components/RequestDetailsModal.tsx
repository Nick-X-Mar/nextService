'use client'

import Modal from '../../../components/Modal'
import RequestDetailsContent from './RequestDetailsContent'
import { styles } from '../../../styles/styles'

interface ServiceRequest {
  id: string
  clientId: string
  vehicleId: string
  category: string
  description: string
  status: 'appointment' | 'pending' | 'in-progress' | 'completed' | 'cancelled'
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
  }
  clientAvailabilityDates?: string[]
}

interface RequestDetailsModalProps {
  request: ServiceRequest
  onClose: () => void
  onRequestUpdate?: (request: ServiceRequest) => void
  getStatusIcon: (status: string) => React.ReactNode
  getStatusText: (status: string) => string
  getStatusColor: (status: string) => string
}

export default function RequestDetailsModal({ 
  request, 
  onClose, 
  onRequestUpdate,
  getStatusIcon, 
  getStatusText, 
  getStatusColor 
}: RequestDetailsModalProps) {
  const footer = (
    <button
      onClick={onClose}
      className={`${styles.btnSecondary} px-6 py-2`}
    >
      Κλείσιμο
    </button>
  )

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Λεπτομέρειες Αιτήματος"
      size="lg"
      footer={footer}
    >
      <RequestDetailsContent
        request={request}
        onRequestUpdate={onRequestUpdate}
        getStatusIcon={getStatusIcon}
        getStatusText={getStatusText}
        getStatusColor={getStatusColor}
      />
    </Modal>
  )
}
