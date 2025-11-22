'use client'

import { useState } from 'react'
import { HiPencil, HiCheck, HiXMark, HiChevronDown, HiChevronUp } from 'react-icons/hi2'
import { SegmentedControl } from './index'
import { styles } from '../styles/styles'
import { ServiceRequestStatus } from '../types/statuses'
import type { ServiceRequest } from '../types/requests'

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

  const getStatusColor = (status: ServiceRequestStatus) => {
    switch (status) {
      case ServiceRequestStatus.PENDING:
        return 'bg-yellow-100 text-yellow-800'
      case ServiceRequestStatus.IN_PROGRESS:
        return 'bg-blue-100 text-blue-800'
      case ServiceRequestStatus.COMPLETED:
        return 'bg-green-100 text-green-800'
      case ServiceRequestStatus.CANCELLED:
        return 'bg-red-100 text-red-800'
      case ServiceRequestStatus.APPOINTMENT:
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
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
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      {/* Header - Always visible */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Λεπτομέρειες Αιτήματος & Οχήματος</h3>
          <div className="flex items-center gap-2">
            {/* Status badge - always visible */}
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(request.status)}`}>
              {getStatusText(request.status)}
            </span>
          </div>
          {/* Quick summary when collapsed */}
          {!isExpanded && request.vehicle && (
            <div className="text-sm text-gray-500 ml-2">
              {request.vehicle.brand} {request.vehicle.model} ({request.vehicle.modelYear})
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {allowEdit && isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsEditing(!isEditing)
              }}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <HiPencil className="h-4 w-4" />
            </button>
          )}
          <button className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            {isExpanded ? <HiChevronUp className="h-5 w-5" /> : <HiChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-200">
          <div className="pt-4 space-y-4">

        {/* Request Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Category */}
          <div>
            <label className="text-sm font-medium text-gray-600">Κατηγορία</label>
            {isEditing && allowEdit ? (
              <select
                value={editData.category}
                onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="service">Συντήρηση</option>
                <option value="fanopeia">Φανοποιεία</option>
                <option value="oils">Λάδια & Υγρά</option>
                <option value="disk">Δισκόφρενα</option>
              </select>
            ) : (
              <p className="text-sm text-gray-900 mt-1">{getCategoryText(request.category)}</p>
            )}
          </div>

          
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-medium text-gray-600">Περιγραφή</label>
          {isEditing && allowEdit ? (
            <textarea
              value={editData.description}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              rows={3}
            />
          ) : (
            <p className="text-sm text-gray-900 mt-1">{request.description}</p>
          )}
        </div>

        {/* Vehicle Details */}
        {request.vehicle && (
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-md font-medium text-gray-900 mb-4">Στοιχεία Οχήματος</h4>
            
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
                    className={styles.input}
                  />
                ) : (
                  <p className="text-sm text-gray-900 mt-1">{request.vehicle.brand}</p>
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
                    className={styles.input}
                  />
                ) : (
                  <p className="text-sm text-gray-900 mt-1">{request.vehicle.model}</p>
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
                    className={styles.input}
                    maxLength={4}
                  />
                ) : (
                  <p className="text-sm text-gray-900 mt-1">{request.vehicle.modelYear}</p>
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
                    className={styles.input}
                  />
                ) : (
                  <p className="text-sm text-gray-900 mt-1">{request.vehicle.licensePlate}</p>
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
                    className={styles.input}
                    maxLength={4}
                  />
                ) : (
                  <p className="text-sm text-gray-900 mt-1">{request.vehicle.engineCC}</p>
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
                    className={styles.input}
                  />
                ) : (
                  <p className="text-sm text-gray-900 mt-1">{request.vehicle.engineNumber}</p>
                )}
              </div>

              {/* VIN Number */}
              <div>
                <label className={styles.label}>VIN</label>
                {isEditing && allowEdit ? (
                  <input
                    type="text"
                    value={editData.vinNumber}
                    onChange={(e) => setEditData({ ...editData, vinNumber: e.target.value })}
                    className={styles.input}
                  />
                ) : (
                  <p className="text-sm text-gray-900 mt-1">{request.vehicle.vinNumber}</p>
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
                  <p className="text-sm text-gray-900 mt-1">
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
                  <p className="text-sm text-gray-900 mt-1">
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
                <p className="text-sm text-gray-900 mt-1">
                  {request.vehicle.is4x4 ? '4x4' : '2WD'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Photos count */}
        {request.photoUrls && request.photoUrls.length > 0 && (
          <div className="border-t border-gray-200 pt-4">
            <label className="text-sm font-medium text-gray-600">Φωτογραφίες</label>
            <p className="text-sm text-gray-900 mt-1">{request.photoUrls.length} φωτογραφία/ες</p>
          </div>
        )}

        {/* Edit Actions */}
        {isEditing && allowEdit && (
          <div className="flex gap-2 pt-4 border-t border-gray-200">
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white text-sm rounded-md hover:bg-green-600 transition-colors"
            >
              <HiCheck className="h-3 w-3" />
              Αποθήκευση
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-3 py-1 bg-gray-500 text-white text-sm rounded-md hover:bg-gray-600 transition-colors"
            >
              <HiXMark className="h-3 w-3" />
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
