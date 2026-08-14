'use client'

import { useState, useEffect, useMemo } from 'react'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import ServiceCategoryModal from '@/components/ServiceCategoryModal'
import { styles } from '../../../../styles/styles'

interface Vehicle {
  id: string
  clientId: string
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
  color?: string
  nickname?: string
  licensePhotoUrl?: string
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

interface VehiclesSectionProps {
  vehicles: Vehicle[]
  onUpdate: (vehicleId: string, updatedVehicle: Partial<Vehicle>) => Promise<boolean>
}

export default function VehiclesSection({ vehicles, onUpdate }: VehiclesSectionProps) {
  const [currentVehicleIndex, setCurrentVehicleIndex] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<Partial<Vehicle>>({})

  const currentVehicle = vehicles[currentVehicleIndex] || null

  // Update form data when current vehicle changes
  useEffect(() => {
    if (currentVehicle) {
      setFormData({
        brand: currentVehicle.brand || '',
        model: currentVehicle.model || '',
        modelYear: currentVehicle.modelYear || '',
        engineCC: currentVehicle.engineCC || '',
        fuelType: currentVehicle.fuelType || '',
        isAutomatic: currentVehicle.isAutomatic || false,
        is4x4: currentVehicle.is4x4 || false,
        isTurbo: currentVehicle.isTurbo || false,
        licensePlate: currentVehicle.licensePlate || '',
        engineNumber: currentVehicle.engineNumber || '',
        vinNumber: currentVehicle.vinNumber || '',
        color: currentVehicle.color || '',
        nickname: currentVehicle.nickname || '',
      })
      setIsEditing(false)
    }
  }, [currentVehicle])

  const handleInputChange = (field: keyof Vehicle, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSave = async () => {
    if (!currentVehicle) return
    setIsSubmitting(true)
    try {
      const success = await onUpdate(currentVehicle.id, formData)
      if (success) {
        setIsEditing(false)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (currentVehicle) {
      setFormData({
        brand: currentVehicle.brand || '',
        model: currentVehicle.model || '',
        modelYear: currentVehicle.modelYear || '',
        engineCC: currentVehicle.engineCC || '',
        fuelType: currentVehicle.fuelType || '',
        isAutomatic: currentVehicle.isAutomatic || false,
        is4x4: currentVehicle.is4x4 || false,
        isTurbo: currentVehicle.isTurbo || false,
        licensePlate: currentVehicle.licensePlate || '',
        engineNumber: currentVehicle.engineNumber || '',
        vinNumber: currentVehicle.vinNumber || '',
        color: currentVehicle.color || '',
        nickname: currentVehicle.nickname || '',
      })
    }
    setIsEditing(false)
  }

  const handlePrevious = () => {
    if (currentVehicleIndex > 0) {
      setCurrentVehicleIndex(currentVehicleIndex - 1)
    }
  }

  const handleNext = () => {
    if (currentVehicleIndex < vehicles.length - 1) {
      setCurrentVehicleIndex(currentVehicleIndex + 1)
    }
  }

  // Build vehicle form data to pass to the category modal
  const vehicleExtraFormData = useMemo(() => {
    if (!currentVehicle) return undefined
    return {
      brand: currentVehicle.brand || '',
      model: currentVehicle.model || '',
      isBrandOther: false,
      isModelOther: false,
      customBrand: '',
      customModel: '',
      modelYear: currentVehicle.modelYear?.toString() || '',
      vinNumber: currentVehicle.vinNumber || '',
      engineCC: currentVehicle.engineCC?.toString() || '',
      fuelType: (currentVehicle.fuelType as 'petrol' | 'diesel' | '') || '',
      isAutomatic: currentVehicle.isAutomatic || false,
      is4x4: currentVehicle.is4x4 || false,
      isTurbo: currentVehicle.isTurbo || false,
      engineNumber: currentVehicle.engineNumber || '',
      description: '',
      estimatedPrice: null,
      originalVehicleId: currentVehicle.id,
      originalVehicleData: {
        brand: currentVehicle.brand || '',
        model: currentVehicle.model || '',
        modelYear: currentVehicle.modelYear?.toString(),
        engineCC: currentVehicle.engineCC?.toString(),
        fuelType: currentVehicle.fuelType || '',
        isAutomatic: currentVehicle.isAutomatic || false,
        is4x4: currentVehicle.is4x4 || false,
        vinNumber: currentVehicle.vinNumber || '',
        engineNumber: currentVehicle.engineNumber || '',
        licensePlate: currentVehicle.licensePlate || '',
        color: currentVehicle.color || ''
      }
    }
  }, [currentVehicle])

  if (vehicles.length === 0) {
    return (
      <div className={styles.card}>
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name="directions_car" className="text-on-surface-variant" size="lg" />
          </div>
          <h3 className={`${styles.cardTitle} mb-2`}>Δεν υπάρχουν οχήματα</h3>
          <p className={styles.bodyText}>Δεν έχετε καταχωρήσει κάποιο όχημα ακόμα.</p>
        </div>
      </div>
    )
  }

  if (!currentVehicle) {
    return null
  }

  const fuelTypeText = currentVehicle.fuelType === 'petrol'
    ? 'Βενζίνη'
    : currentVehicle.fuelType === 'diesel'
    ? 'Ντίζελ'
    : currentVehicle.fuelType === 'electric'
    ? 'Ηλεκτρικό'
    : currentVehicle.fuelType === 'hybrid'
    ? 'Υβριδικό'
    : currentVehicle.fuelType || '-'

  const ReadOnlyField = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
    <div className="space-y-2">
      <label className={styles.labelUpper}>{label}</label>
      <div className="px-4 py-3.5 bg-surface-container-highest/50 rounded-xl">
        <p className={`text-sm font-medium text-on-surface ${mono ? 'font-mono' : ''}`}>
          {value || '-'}
        </p>
      </div>
    </div>
  )

  const EditableField = ({ label, value, onChange, placeholder, required }: {
    label: string; value: string; onChange: (v: string) => void; placeholder: string; required?: boolean
  }) => (
    <div className="space-y-2">
      <label className={styles.labelUpper}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={styles.input}
      />
    </div>
  )

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 bg-surface-container rounded-lg flex items-center justify-center">
            <Icon name="directions_car" filled className="text-primary" />
          </div>
          <div className="flex-1">
            <h2 className={`${styles.sectionTitle} mb-0`}>Οχήματα</h2>
            {vehicles.length > 1 && (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs font-bold text-on-surface-variant">
                  {currentVehicleIndex + 1} από {vehicles.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePrevious}
                    disabled={currentVehicleIndex === 0}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      currentVehicleIndex === 0
                        ? 'text-on-surface-variant/30 cursor-not-allowed'
                        : 'text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    <Icon name="chevron_left" size="md" />
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={currentVehicleIndex === vehicles.length - 1}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      currentVehicleIndex === vehicles.length - 1
                        ? 'text-on-surface-variant/30 cursor-not-allowed'
                        : 'text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    <Icon name="chevron_right" size="md" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className={styles.btnOutline}
          >
            <Icon name="edit" size="sm" />
            Επεξεργασία
          </button>
        )}
      </div>

      {/* Vehicle Title Banner */}
      {(currentVehicle.nickname || currentVehicle.brand || currentVehicle.model) && (
        <div className="mb-6 p-4 bg-gradient-to-r from-primary/5 to-primary-container/10 rounded-xl border border-primary/10 flex items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-black tracking-tight text-on-surface">
              {currentVehicle.nickname || `${currentVehicle.brand} ${currentVehicle.model}`}
            </h3>
            {currentVehicle.nickname && (
              <p className="text-sm text-secondary mt-1">
                {currentVehicle.brand} {currentVehicle.model}
              </p>
            )}
          </div>
          {!isEditing && (
            <button
              onClick={() => setCategoryModalOpen(true)}
              className={styles.btnPrimary}
            >
              <Icon name="add" size="sm" />
              Νέο Αίτημα
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="space-y-6">
        {/* Basic Information Section */}
        <div>
          <h4 className={`${styles.labelUpper} mb-4`}>
            Βασικές Πληροφορίες
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isEditing ? (
              <>
                <EditableField label="Μάρκα" value={formData.brand || ''} onChange={(v) => handleInputChange('brand', v)} placeholder="Μάρκα" required />
                <EditableField label="Μοντέλο" value={formData.model || ''} onChange={(v) => handleInputChange('model', v)} placeholder="Μοντέλο" required />
                <EditableField label="Έτος Κατασκευής" value={formData.modelYear || ''} onChange={(v) => handleInputChange('modelYear', v)} placeholder="π.χ. 2020" />
                <EditableField label="Χρώμα" value={formData.color || ''} onChange={(v) => handleInputChange('color', v)} placeholder="Χρώμα" />
                <EditableField label="Πινακίδα" value={formData.licensePlate || ''} onChange={(v) => handleInputChange('licensePlate', v)} placeholder="π.χ. ABC-1234" />
                <EditableField label="Ψευδώνυμο" value={formData.nickname || ''} onChange={(v) => handleInputChange('nickname', v)} placeholder="π.χ. Το αμάξι μου" />
              </>
            ) : (
              <>
                <ReadOnlyField label="Μάρκα" value={currentVehicle.brand || '-'} />
                <ReadOnlyField label="Μοντέλο" value={currentVehicle.model || '-'} />
                <ReadOnlyField label="Έτος Κατασκευής" value={currentVehicle.modelYear || '-'} />
                <ReadOnlyField label="Χρώμα" value={currentVehicle.color || '-'} />
                <ReadOnlyField label="Πινακίδα" value={currentVehicle.licensePlate || '-'} />
                {currentVehicle.nickname && (
                  <ReadOnlyField label="Ψευδώνυμο" value={currentVehicle.nickname} />
                )}
              </>
            )}
          </div>
        </div>

        {/* Technical Specifications Section */}
        <div className="pt-6 border-t border-outline-variant/10">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="settings" size="sm" className="text-on-surface-variant" />
            <h4 className={`${styles.labelUpper} mb-0`}>
              Τεχνικά Χαρακτηριστικά
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Engine CC */}
            {isEditing ? (
              <EditableField label="Κυβισμός (cc)" value={formData.engineCC || ''} onChange={(v) => handleInputChange('engineCC', v)} placeholder="π.χ. 1600" />
            ) : (
              <ReadOnlyField label="Κυβισμός (cc)" value={currentVehicle.engineCC ? `${currentVehicle.engineCC} cc` : '-'} />
            )}

            {/* Fuel Type */}
            <div className="space-y-2">
              <label className={styles.labelUpper}>Καύσιμο</label>
              {isEditing ? (
                <select
                  value={formData.fuelType || ''}
                  onChange={(e) => handleInputChange('fuelType', e.target.value)}
                  className={styles.select}
                >
                  <option value="">Επιλέξτε</option>
                  <option value="petrol">Βενζίνη</option>
                  <option value="diesel">Ντίζελ</option>
                  <option value="electric">Ηλεκτρικό</option>
                  <option value="hybrid">Υβριδικό</option>
                </select>
              ) : (
                <div className="px-4 py-3.5 bg-surface-container-highest/50 rounded-xl">
                  <p className="text-sm font-medium text-on-surface">
                    {fuelTypeText}
                  </p>
                </div>
              )}
            </div>

            {/* Transmission Type */}
            <div className="space-y-2">
              <label className={styles.labelUpper}>Μετάδοση</label>
              {isEditing ? (
                <div className={styles.toggleContainer}>
                  <button
                    type="button"
                    onClick={() => handleInputChange('isAutomatic', false)}
                    className={
                      formData.isAutomatic === false
                        ? styles.toggleBtnActive
                        : styles.toggleBtnInactive
                    }
                  >
                    Χειροκίνητο
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInputChange('isAutomatic', true)}
                    className={
                      formData.isAutomatic === true
                        ? styles.toggleBtnActive
                        : styles.toggleBtnInactive
                    }
                  >
                    Αυτόματο
                  </button>
                </div>
              ) : (
                <div className="px-4 py-3.5 bg-surface-container-highest/50 rounded-xl">
                  <p className="text-sm font-medium text-on-surface">
                    {currentVehicle.isAutomatic ? 'Αυτόματο' : 'Χειροκίνητο'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Identification Numbers Section */}
        <div className="pt-6 border-t border-outline-variant/10">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="description" size="sm" className="text-on-surface-variant" />
            <h4 className={`${styles.labelUpper} mb-0`}>
              Αριθμοί Αναγνώρισης
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isEditing ? (
              <>
                <EditableField label="VIN Number" value={formData.vinNumber || ''} onChange={(v) => handleInputChange('vinNumber', v)} placeholder="VIN Number" />
                <EditableField label="Αριθμός Κινητήρα" value={formData.engineNumber || ''} onChange={(v) => handleInputChange('engineNumber', v)} placeholder="Αριθμός Κινητήρα" />
              </>
            ) : (
              <>
                <ReadOnlyField label="VIN Number" value={currentVehicle.vinNumber || '-'} mono />
                <ReadOnlyField label="Αριθμός Κινητήρα" value={currentVehicle.engineNumber || '-'} mono />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit Action Buttons */}
      {isEditing && (
        <div className="flex gap-3 pt-6 mt-6 border-t border-outline-variant/10">
          <button
            onClick={handleSave}
            disabled={isSubmitting || !formData.brand?.trim() || !formData.model?.trim()}
            className={`${styles.btnPrimary} ${(isSubmitting || !formData.brand?.trim() || !formData.model?.trim()) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isSubmitting ? <Spinner size="sm" /> : <Icon name="check" size="sm" />}
            {isSubmitting ? 'Αποθήκευση...' : 'Αποθήκευση'}
          </button>
          <button
            onClick={handleCancel}
            disabled={isSubmitting}
            className={styles.btnOutline}
          >
            <Icon name="close" size="sm" />
            Ακύρωση
          </button>
        </div>
      )}

      <ServiceCategoryModal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        extraFormData={vehicleExtraFormData}
      />
    </div>
  )
}
