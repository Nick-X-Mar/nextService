'use client'

import Icon from '@/components/ui/Icon'
import { ServiceRequestStatus } from '../../../types/statuses'
import type { ServiceRequest } from '../../../types/requests'
import { getCategoryText } from '@/utils/categoryLabels'

interface RequestCardProps {
  request: ServiceRequest
  onViewDetails: () => void
  onChatClick?: () => void
  onCancelClick?: () => void
  hasGarageMessages?: boolean
  getStatusIcon: (status: ServiceRequestStatus) => React.ReactNode
  getStatusText: (status: ServiceRequestStatus) => string
  getStatusColor: (status: ServiceRequestStatus) => string
  disabled?: boolean
  hasOffers?: boolean
}

export default function RequestCard({
  request,
  onViewDetails,
  onChatClick,
  onCancelClick,
  hasGarageMessages = false,
  getStatusIcon: _getStatusIcon,
  getStatusText,
  getStatusColor,
  disabled = false,
  hasOffers = false
}: RequestCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('el-GR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
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
        return 'handyman'
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
      className={`bg-surface-container-lowest p-5 shadow-[0_-4px_24px_rgba(27,28,28,0.02)] border border-outline-variant/10 transition-all duration-200 ${
        hasOffers ? 'rounded-t-xl border-b-0' : 'rounded-xl'
      } ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:shadow-2xl hover:shadow-on-surface/5 cursor-pointer active:scale-[0.99]'
      }`}
      onClick={disabled ? undefined : onViewDetails}
    >
      {/* Desktop: horizontal layout / Mobile: stacked */}
      <div className="md:flex md:items-center md:gap-6">
        {/* Left: main info */}
        <div className="md:flex-1 md:min-w-0">
          {/* Status + Vehicle + Date row */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusColor(request.status)}`}>
              {getStatusText(request.status)}
            </span>
            {request.vehicle && (
              <h3 className="text-lg font-bold leading-tight">
                {request.vehicle.brand} {request.vehicle.model} {request.vehicle.modelYear || ''}
              </h3>
            )}
          </div>

          {/* Category + Date inline */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
            <div className="flex items-center gap-1.5">
              <Icon name={getCategoryIcon(request.category)} size="sm" className="text-primary" />
              <span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                {getCategoryText(request.category)}
              </span>
            </div>
            <div className="flex items-center gap-1 text-on-surface-variant/70">
              <Icon name="calendar_month" size="sm" />
              <span className="text-[10px] font-medium">{formatDate(request.createdAt)}</span>
            </div>
          </div>

          {/* Appointment date */}
          {request.status === ServiceRequestStatus.APPOINTMENT && request.appointmentDate && (
            <div className="bg-blue-50 rounded-xl p-3 mb-2 flex items-center gap-3 md:inline-flex">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Icon name="event" filled className="text-blue-600" size="sm" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-600">
                  Ημερομηνία Ραντεβού
                </p>
                <p className="text-sm font-bold text-blue-900">
                  {formatAppointmentDate(request.appointmentDate)}
                </p>
              </div>
            </div>
          )}

          {/* Description */}
          {request.description && (
            <p className="text-sm text-secondary leading-relaxed line-clamp-1 md:line-clamp-2">
              {request.description}
            </p>
          )}
        </div>

        {/* Right side: cost + buttons */}
        <div className="flex items-center gap-4 mt-4 md:mt-0 md:flex-shrink-0 border-t border-surface-container pt-4 md:border-t-0 md:pt-0 md:border-l md:border-surface-container md:pl-6">
          {estimatedCost && (
            <div className="text-right mr-2 hidden md:block">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Εκτίμηση</p>
              <p className="text-xl font-bold text-tertiary">{estimatedCost}€</p>
            </div>
          )}
          {/* Mobile: cost shown inline */}
          {estimatedCost && (
            <div className="text-left mr-auto md:hidden">
              <p className="text-lg font-bold text-tertiary">{estimatedCost}€</p>
            </div>
          )}
          {onChatClick && request.status !== ServiceRequestStatus.APPOINTMENT && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (hasGarageMessages) onChatClick()
              }}
              disabled={!hasGarageMessages}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-widest rounded-lg transition-colors ${
                hasGarageMessages
                  ? 'text-on-surface-variant bg-surface-variant hover:bg-surface-container-high'
                  : 'text-on-surface-variant/40 bg-surface-container cursor-not-allowed'
              }`}
            >
              Συνομιλία
            </button>
          )}
          {request.status === ServiceRequestStatus.APPOINTMENT && onCancelClick && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCancelClick()
              }}
              className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-error bg-error-container/30 hover:bg-error-container/50 rounded-lg transition-colors"
            >
              Ακύρωση
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!disabled) onViewDetails()
            }}
            disabled={disabled}
            className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-on-primary bg-gradient-to-br from-primary to-primary-container rounded-lg shadow-sm active:scale-95 transition-all"
          >
            Λεπτομέρειες
          </button>
        </div>
      </div>
    </div>
  )
}
