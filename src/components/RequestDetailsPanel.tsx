'use client'

import { useState } from 'react'
import { SegmentedControl } from './index'
import { styles } from '../styles/styles'
import { ServiceRequestStatus } from '../types/statuses'
import type { ServiceRequest } from '../types/requests'
import Icon from '@/components/ui/Icon'
import { getCategoryText } from '@/utils/categoryLabels'

interface RequestDetailsPanelProps {
  request: ServiceRequest
  onUpdate?: (updatedRequest: Partial<ServiceRequest>) => void
  allowEdit?: boolean
}

export default function RequestDetailsPanel({ request, onUpdate, allowEdit = true }: RequestDetailsPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [editData, setEditData] = useState({
    description: request.description,
    category: request.category,
    brand: request.vehicle?.brand || '',
    model: request.vehicle?.model || '',
    modelYear: request.vehicle?.modelYear || '',
    licensePlate: request.vehicle?.licensePlate || '',
    engineCC: request.vehicle?.engineCC || '',
    engineNumber: request.vehicle?.engineNumber || '',
    fuelType: request.vehicle?.fuelType || 'petrol' as 'petrol' | 'diesel',
    vinNumber: request.vehicle?.vinNumber || '',
    is4x4: request.vehicle?.is4x4 || false,
    isAutomatic: request.vehicle?.isAutomatic || false
  })

  const getStatusText = (status: ServiceRequestStatus) => {
    switch (status) {
      case ServiceRequestStatus.PENDING:
        return 'Εκκρεμεί'
      case ServiceRequestStatus.IN_PROGRESS:
        return 'Σε Εξέλιξη'
      case ServiceRequestStatus.COMPLETED:
        return 'Ολοκληρώθηκε'
      case ServiceRequestStatus.CANCELLED:
        return 'Ακυρώθηκε'
      case ServiceRequestStatus.APPOINTMENT:
        return 'Ραντεβού'
      default:
        return status
    }
  }

  const getStatusStyle = (status: ServiceRequestStatus) => {
    switch (status) {
      case ServiceRequestStatus.PENDING:
        return styles.statusPending
      case ServiceRequestStatus.IN_PROGRESS:
        return styles.statusInProgress
      case ServiceRequestStatus.COMPLETED:
        return styles.statusCompleted
      case ServiceRequestStatus.CANCELLED:
        return styles.statusCancelled
      case ServiceRequestStatus.APPOINTMENT:
        return styles.statusAppointment
      default:
        return 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-secondary bg-surface-container px-2 py-1 rounded-sm'
    }
  }

  const handleSave = () => {
    if (onUpdate) {
      const updatedRequest = {
        description: editData.description,
        category: editData.category,
        vehicle: {
          brand: editData.brand,
          model: editData.model,
          modelYear: editData.modelYear,
          licensePlate: editData.licensePlate,
          engineCC: editData.engineCC,
          engineNumber: editData.engineNumber,
          fuelType: editData.fuelType,
          vinNumber: editData.vinNumber,
          is4x4: editData.is4x4,
          isAutomatic: editData.isAutomatic
        }
      }
      onUpdate(updatedRequest)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditData({
      description: request.description,
      category: request.category,
      brand: request.vehicle?.brand || '',
      model: request.vehicle?.model || '',
      modelYear: request.vehicle?.modelYear || '',
      licensePlate: request.vehicle?.licensePlate || '',
      engineCC: request.vehicle?.engineCC || '',
      engineNumber: request.vehicle?.engineNumber || '',
      fuelType: request.vehicle?.fuelType || 'petrol' as 'petrol' | 'diesel',
      vinNumber: request.vehicle?.vinNumber || '',
      is4x4: request.vehicle?.is4x4 || false,
      isAutomatic: request.vehicle?.isAutomatic || false
    })
    setIsEditing(false)
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 overflow-hidden">
      {/* Header - Always visible */}
      {/* Same rule as every other card in the app: the row opens it, the arrow closes it. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-surface-container-low transition-colors"
        onClick={() => { if (!isExpanded) setIsExpanded(true) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setIsExpanded(!isExpanded)
          }
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon name="assignment" size="sm" className="text-primary flex-shrink-0" filled />
          <p className={`${styles.labelUpper} flex-shrink-0`}>Λεπτομέρειες</p>
          <span className={getStatusStyle(request.status)}>
            {getStatusText(request.status)}
          </span>
          {/* Quick summary when collapsed */}
          {!isExpanded && request.vehicle && (
            <span className="text-xs text-secondary truncate hidden sm:inline">
              {request.vehicle.brand} {request.vehicle.model} ({request.vehicle.modelYear})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {allowEdit && isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsEditing(!isEditing)
              }}
              className="w-7 h-7 rounded-full hover:bg-surface-container flex items-center justify-center transition-colors"
            >
              <Icon name="edit" size="sm" className="text-on-surface-variant" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(!isExpanded)
            }}
            aria-label={isExpanded ? 'Κλείσιμο' : 'Άνοιγμα'}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors active:scale-95"
          >
            <Icon name={isExpanded ? 'expand_less' : 'expand_more'} size="md" />
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-5 pb-5 border-t border-outline-variant/10">
          <div className="pt-4 space-y-4">

        {/* Request Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Category */}
          <div>
            <label className={styles.label}>Κατηγορία</label>
            {isEditing && allowEdit ? (
              <select
                value={editData.category}
                onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                className={`${styles.select} mt-1`}
              >
                <option value="service">Συντήρηση</option>
                <option value="fanopeia">Φανοποιεία</option>
                <option value="oils">Λάδια & Υγρά</option>
                <option value="disk">Δισκόφρενα</option>
              </select>
            ) : (
              <p className="text-sm font-medium text-on-surface mt-1">{getCategoryText(request.category)}</p>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className={styles.label}>Περιγραφή</label>
          {isEditing && allowEdit ? (
            <textarea
              value={editData.description}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              className={`${styles.textarea} mt-1`}
              rows={3}
            />
          ) : (
            <p className="text-sm font-medium text-on-surface mt-1">{request.description}</p>
          )}
        </div>

        {/* Vehicle Details */}
        {request.vehicle && (
          <div className="border-t border-outline-variant/10 pt-4">
            <div className="flex items-center gap-2 mb-4">
              <Icon name="directions_car" size="sm" className="text-primary" filled />
              <p className={styles.labelUpper}>Στοιχεία Οχήματος</p>
            </div>

            {/* Basic Vehicle Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Brand */}
              <div>
                <label className={styles.label}>Μάρκα</label>
                {isEditing && allowEdit ? (
                  <input
                    type="text"
                    value={editData.brand}
                    onChange={(e) => setEditData({ ...editData, brand: e.target.value })}
                    className={`${styles.input} mt-1`}
                  />
                ) : (
                  <p className="text-sm font-medium text-on-surface mt-1">{request.vehicle.brand}</p>
                )}
              </div>

              {/* Model */}
              <div>
                <label className={styles.label}>Μοντέλο</label>
                {isEditing && allowEdit ? (
                  <input
                    type="text"
                    value={editData.model}
                    onChange={(e) => setEditData({ ...editData, model: e.target.value })}
                    className={`${styles.input} mt-1`}
                  />
                ) : (
                  <p className="text-sm font-medium text-on-surface mt-1">{request.vehicle.model}</p>
                )}
              </div>

              {/* Model Year */}
              <div>
                <label className={styles.label}>Έτος</label>
                {isEditing && allowEdit ? (
                  <input
                    type="text"
                    value={editData.modelYear}
                    onChange={(e) => setEditData({ ...editData, modelYear: e.target.value })}
                    className={`${styles.input} mt-1`}
                    maxLength={4}
                  />
                ) : (
                  <p className="text-sm font-medium text-on-surface mt-1">{request.vehicle.modelYear}</p>
                )}
              </div>

              {/* License Plate */}
              <div>
                <label className={styles.label}>Αριθμός Κυκλοφορίας</label>
                {isEditing && allowEdit ? (
                  <input
                    type="text"
                    value={editData.licensePlate}
                    onChange={(e) => setEditData({ ...editData, licensePlate: e.target.value })}
                    className={`${styles.input} mt-1`}
                  />
                ) : (
                  <p className="text-sm font-medium text-on-surface mt-1">{request.vehicle.licensePlate}</p>
                )}
              </div>
            </div>

            {/* Technical Specifications */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* Engine CC */}
              <div>
                <label className={styles.label}>CC</label>
                {isEditing && allowEdit ? (
                  <input
                    type="text"
                    value={editData.engineCC}
                    onChange={(e) => setEditData({ ...editData, engineCC: e.target.value })}
                    className={`${styles.input} mt-1`}
                    maxLength={4}
                  />
                ) : (
                  <p className="text-sm font-medium text-on-surface mt-1">{request.vehicle.engineCC}</p>
                )}
              </div>

              {/* Engine Number */}
              <div>
                <label className={styles.label}>Αριθμός Κινητήρα</label>
                {isEditing && allowEdit ? (
                  <input
                    type="text"
                    value={editData.engineNumber}
                    onChange={(e) => setEditData({ ...editData, engineNumber: e.target.value })}
                    className={`${styles.input} mt-1`}
                  />
                ) : (
                  <p className="text-sm font-medium text-on-surface mt-1">{request.vehicle.engineNumber}</p>
                )}
              </div>

              {/* VIN Number */}
              <div>
                <label className={styles.label}>Αριθμός Πλαισίου</label>
                {isEditing && allowEdit ? (
                  <input
                    type="text"
                    value={editData.vinNumber}
                    onChange={(e) => setEditData({ ...editData, vinNumber: e.target.value })}
                    className={`${styles.input} mt-1`}
                  />
                ) : (
                  <p className="text-sm font-medium text-on-surface mt-1">{request.vehicle.vinNumber}</p>
                )}
              </div>
            </div>

            {/* Fuel Type and Transmission */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Fuel Type */}
              <div>
                <label className={styles.label}>Καύσιμο</label>
                {isEditing && allowEdit ? (
                  <SegmentedControl
                    options={[
                      { value: 'petrol', label: 'Βενζίνη' },
                      { value: 'diesel', label: 'Πετρέλαιο' }
                    ]}
                    value={editData.fuelType}
                    onChange={(value) => setEditData({ ...editData, fuelType: value as 'petrol' | 'diesel' })}
                    variant="orange"
                    size="md"
                  />
                ) : (
                  <p className="text-sm font-medium text-on-surface mt-1">
                    {request.vehicle.fuelType === 'petrol' ? 'Βενζίνη' : 'Πετρέλαιο'}
                  </p>
                )}
              </div>

              {/* Transmission */}
              <div>
                <label className={styles.label}>Μετάδοση</label>
                {isEditing && allowEdit ? (
                  <SegmentedControl
                    options={[
                      { value: 'manual', label: 'Χειροκίνητο' },
                      { value: 'automatic', label: 'Αυτόματο' }
                    ]}
                    value={editData.isAutomatic ? 'automatic' : 'manual'}
                    onChange={(value) => setEditData({ ...editData, isAutomatic: value === 'automatic' })}
                    variant="orange"
                    size="md"
                  />
                ) : (
                  <p className="text-sm font-medium text-on-surface mt-1">
                    {request.vehicle.isAutomatic ? 'Αυτόματο' : 'Χειροκίνητο'}
                  </p>
                )}
              </div>
            </div>

            {/* Drive Type */}
            <div className="mt-4">
              <label className={styles.label}>Κίνηση</label>
              {isEditing && allowEdit ? (
                <SegmentedControl
                  options={[
                    { value: '2wd', label: '2WD' },
                    { value: '4x4', label: '4x4' }
                  ]}
                  value={editData.is4x4 ? '4x4' : '2wd'}
                  onChange={(value) => setEditData({ ...editData, is4x4: value === '4x4' })}
                  variant="orange"
                  size="md"
                />
              ) : (
                <p className="text-sm font-medium text-on-surface mt-1">
                  {request.vehicle.is4x4 ? '4x4' : '2WD'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Photos count */}
        {request.photoUrls && request.photoUrls.length > 0 && (
          <div className="border-t border-outline-variant/10 pt-4">
            <label className={styles.label}>Φωτογραφίες</label>
            <div className="flex items-center gap-2 mt-1">
              <Icon name="photo_library" size="sm" className="text-primary" filled />
              <p className="text-sm font-medium text-on-surface">{request.photoUrls.length} φωτογραφία/ες</p>
            </div>
          </div>
        )}

        {/* Edit Actions */}
        {isEditing && allowEdit && (
          <div className="flex gap-2 pt-4 border-t border-outline-variant/10">
            <button
              onClick={handleSave}
              className={styles.btnPrimary}
            >
              <Icon name="check" size="sm" />
              Αποθήκευση
            </button>
            <button
              onClick={handleCancel}
              className={styles.btnOutline}
            >
              <Icon name="close" size="sm" />
              Ακύρωση
            </button>
          </div>
        )}
          </div>
        </div>
      )}
    </div>
  )
}
