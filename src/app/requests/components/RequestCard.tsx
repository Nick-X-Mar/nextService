'use client'

import { HiEye, HiCalendar, HiChatBubbleLeftRight } from 'react-icons/hi2'
import { styles } from '../../../styles/styles'
import { ServiceRequestStatus } from '../../../types/statuses'
import type { ServiceRequest } from '../../../types/requests'

interface RequestCardProps {
  request: ServiceRequest
  onViewDetails: () => void
  onChatClick?: () => void
  hasGarageMessages?: boolean
  getStatusIcon: (status: ServiceRequestStatus) => React.ReactNode
  getStatusText: (status: ServiceRequestStatus) => string
  getStatusColor: (status: ServiceRequestStatus) => string
}

export default function RequestCard({ 
  request, 
  onViewDetails, 
  onChatClick,
  hasGarageMessages = false,
  getStatusIcon, 
  getStatusText, 
  getStatusColor 
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

  const formatAppointmentDate = (dateString: string) => {
    const date = new Date(`${dateString}T00:00:00`)
    return date.toLocaleDateString('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      weekday: 'long'
    })
  }

  return (
    <div 
      className={`${styles.card} hover:shadow-lg hover:border-orange-300 transition-all duration-200 cursor-pointer`}
      onClick={onViewDetails}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Header with status */}
          <div className="flex items-center gap-3 mb-3">
            {getStatusIcon(request.status)}
            <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(request.status)}`}>
              {getStatusText(request.status)}
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

          {/* Appointment Date - Prominent (only for appointments) */}
          {request.status === ServiceRequestStatus.APPOINTMENT && request.appointmentDate && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2">
                <HiCalendar className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    Ημερομηνία Ραντεβού
                  </p>
                  <p className="text-lg font-bold text-blue-700">
                    {formatAppointmentDate(request.appointmentDate)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Details row */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center gap-4">
              {request.status !== ServiceRequestStatus.APPOINTMENT && (
                <>
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
                </>
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

        {/* Price and Action Buttons */}
        <div className="ml-4 flex flex-col items-end gap-3">
          {/* Price - Right aligned (only for appointments) */}
          {request.status === ServiceRequestStatus.APPOINTMENT && typeof request.appointmentPrice === 'number' && (
            <div className="text-right">
              <div className="text-2xl font-bold text-orange-600">
                €{request.appointmentPrice}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
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
          
          {/* Show chat button for requests that might have chat activity */}
          {(request.status === ServiceRequestStatus.PENDING || request.status === ServiceRequestStatus.IN_PROGRESS) && onChatClick && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (hasGarageMessages) {
                  onChatClick()
                }
              }}
              disabled={!hasGarageMessages}
              className={`flex items-center gap-2 px-3 py-2 text-sm ${
                hasGarageMessages 
                  ? `${styles.btnPrimary} cursor-pointer` 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
              title={!hasGarageMessages ? 'Δεν υπάρχουν μηνύματα από συνεργεία' : ''}
            >
              <HiChatBubbleLeftRight className="h-4 w-4" />
              Συνομιλία
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
