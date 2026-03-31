'use client'

import Modal from '../../../components/Modal'
import RequestDetailsContent from './RequestDetailsContent'
import { ServiceRequestStatus } from '../../../types/statuses'
import type { ServiceRequest } from '../../../types/requests'

interface RequestDetailsModalProps {
  request: ServiceRequest
  onClose: () => void
  onRequestUpdate?: (request: ServiceRequest) => void
  getStatusIcon: (status: ServiceRequestStatus) => React.ReactNode
  getStatusText: (status: ServiceRequestStatus) => string
  getStatusColor: (status: ServiceRequestStatus) => string
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
      className="border border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-surface-container px-6 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 flex items-center gap-2"
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
