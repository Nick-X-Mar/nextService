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
  urgency: 'low' | 'normal' | 'high'
  estimatedCost?: number
  photoUrls: string[]
  photos: any[]
  createdAt: string
  updatedAt: string
  vehicle?: {
    brand: string
    model: string
    modelYear: string
  }
}

interface RequestDetailsModalProps {
  request: ServiceRequest
  onClose: () => void
  getStatusIcon: (status: string) => React.ReactNode
  getStatusText: (status: string) => string
  getStatusColor: (status: string) => string
  getUrgencyColor: (urgency: string) => string
  getUrgencyText: (urgency: string) => string
}

export default function RequestDetailsModal({ 
  request, 
  onClose, 
  getStatusIcon, 
  getStatusText, 
  getStatusColor, 
  getUrgencyColor, 
  getUrgencyText 
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
        getStatusIcon={getStatusIcon}
        getStatusText={getStatusText}
        getStatusColor={getStatusColor}
        getUrgencyColor={getUrgencyColor}
        getUrgencyText={getUrgencyText}
      />
    </Modal>
  )
}
