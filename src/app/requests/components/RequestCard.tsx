'use client'

import Icon from '@/components/ui/Icon'
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
  disabled?: boolean
}

export default function RequestCard({
  request,
  onViewDetails,
  onChatClick,
  hasGarageMessages = false,
  getStatusIcon,
  getStatusText,
  getStatusColor,
  disabled = false
}: RequestCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('el-GR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }

  const getCategoryText = (category: string) => {
    switch (category) {
      case 'service':
        return 'Γενικό Service'
      case 'fanopeia':
        return 'Φανοποιεία'
      case 'oils':
        return 'Λάδια & Υγρά'
      case 'disk':
        return 'Δισκόφρενα'
      case 'kteo':
        return 'ΚΤΕΟ'
      case 'elastika':
        return 'Ελαστικά'
      default:
        return category
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'service':
        return 'build'
      case 'fanopeia':
        return 'car_crash'
      case 'oils':
        return 'oil_barrel'
      case 'disk':
        return 'album'
      case 'kteo':
        return 'verified'
      case 'elastika':
        return 'tire_repair'
      default:
        return 'miscellaneous_services'
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

  const estimatedCost = request.status === ServiceRequestStatus.APPOINTMENT
    ? request.appointmentPrice
    : request.estimatedCost

  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-5 shadow-[0_-4px_24px_rgba(27,28,28,0.02)] border border-outline-variant/10 transition-all duration-200 ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:shadow-2xl hover:shadow-on-surface/5 cursor-pointer active:scale-[0.99]'
      }`}
      onClick={disabled ? undefined : onViewDetails}
    >
      {/* Header: Status + Cost */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-col gap-1">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit ${getStatusColor(request.status)}`}>
            {getStatusText(request.status)}
          </span>
          {/* Vehicle title */}
          {request.vehicle && (
            <h3 className="text-lg font-bold leading-tight">
              {request.vehicle.brand} {request.vehicle.model} {request.vehicle.modelYear || ''}
            </h3>
          )}
          {/* Date */}
          <div className="flex items-center gap-1 text-on-surface-variant/70 mt-1">
            <Icon name="calendar_month" size="sm" />
            <span className="text-[10px] font-medium">{formatDate(request.createdAt)}</span>
          </div>
        </div>
        {estimatedCost && (
          <div className="text-right">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">ΕΚΤΙΜΗΣΗ</p>
            <p className="text-xl font-bold text-tertiary">{estimatedCost}€</p>
          </div>
        )}
      </div>

      {/* Category */}
      <div className="flex items-center gap-2 mb-3">
        <Icon name={getCategoryIcon(request.category)} size="sm" className="text-primary" />
        <span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
          {getCategoryText(request.category)}
        </span>
      </div>

      {/* Appointment date */}
      {request.status === ServiceRequestStatus.APPOINTMENT && request.appointmentDate && (
        <div className="bg-blue-50 rounded-xl p-3 mb-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Icon name="event" filled className="text-blue-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-600">
              Ημερομηνία Ραντεβού
            </p>
            <p className="text-base font-bold text-blue-900">
              {formatAppointmentDate(request.appointmentDate)}
            </p>
          </div>
        </div>
      )}

      {/* Description */}
      {request.description && (
        <p className="text-sm text-secondary leading-relaxed mb-6 line-clamp-2">
          {request.description}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 border-t border-surface-container pt-4">
        {onChatClick && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (hasGarageMessages) onChatClick()
            }}
            disabled={!hasGarageMessages}
            className={`flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-widest rounded-lg transition-colors ${
              hasGarageMessages
                ? 'text-on-surface-variant bg-surface-variant hover:bg-surface-container-high'
                : 'text-on-surface-variant/40 bg-surface-container cursor-not-allowed'
            }`}
          >
            Συνομιλία
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (!disabled) onViewDetails()
          }}
          disabled={disabled}
          className="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-on-primary bg-gradient-to-br from-primary to-primary-container rounded-lg shadow-sm active:scale-95 transition-all"
        >
          Λεπτομέρειες
        </button>
      </div>
    </div>
  )
}
