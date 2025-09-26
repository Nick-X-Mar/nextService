'use client'

import { HiEye, HiCalendar, HiMapPin } from 'react-icons/hi2'
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

interface RequestCardProps {
  request: ServiceRequest
  onViewDetails: () => void
  getStatusIcon: (status: string) => React.ReactNode
  getStatusText: (status: string) => string
  getStatusColor: (status: string) => string
  getUrgencyColor: (urgency: string) => string
  getUrgencyText: (urgency: string) => string
}

export default function RequestCard({ 
  request, 
  onViewDetails, 
  getStatusIcon, 
  getStatusText, 
  getStatusColor, 
  getUrgencyColor, 
  getUrgencyText 
}: RequestCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getCategoryText = (category: string) => {
    switch (category) {
      case 'service':
        return 'Συντήρηση'
      case 'fanopeia':
        return 'Φανοποιεία'
      case 'oils':
        return 'Λάδια & Υγρά'
      case 'disk':
        return 'Δισκόφρενα'
      default:
        return category
    }
  }

  return (
    <div 
      className={`${styles.card} hover:shadow-lg hover:border-orange-300 transition-all duration-200 cursor-pointer`}
      onClick={onViewDetails}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Header with status and urgency */}
          <div className="flex items-center gap-3 mb-3">
            {getStatusIcon(request.status)}
            <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(request.status)}`}>
              {getStatusText(request.status)}
            </span>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getUrgencyColor(request.urgency)}`}>
              {getUrgencyText(request.urgency)} Προτεραιότητα
            </span>
          </div>

          {/* Vehicle info */}
          {request.vehicle && (
            <div className="mb-3">
              <h3 className="font-semibold text-gray-900">
                {request.vehicle.brand} {request.vehicle.model} ({request.vehicle.modelYear})
              </h3>
              <p className="text-sm text-gray-600">
                Κατηγορία: {getCategoryText(request.category)}
              </p>
            </div>
          )}

          {/* Description */}
          <p className="text-gray-700 mb-3 line-clamp-2">
            {request.description}
          </p>

          {/* Details row */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <HiCalendar className="h-4 w-4" />
                <span>{formatDate(request.createdAt)}</span>
              </div>
              {request.estimatedCost && (
                <div className="flex items-center gap-1">
                  <span className="font-medium text-green-600">
                    €{request.estimatedCost}
                  </span>
                </div>
              )}
              {request.photoUrls.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-blue-600">
                    {request.photoUrls.length} φωτογραφί{request.photoUrls.length === 1 ? 'α' : 'ες'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* View Details Button */}
        <div className="ml-4">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onViewDetails()
            }}
            className={`${styles.btnSecondary} flex items-center gap-2 px-3 py-2 text-sm`}
          >
            <HiEye className="h-4 w-4" />
            Λεπτομέρειες
          </button>
        </div>
      </div>
    </div>
  )
}
