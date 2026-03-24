'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HiChevronLeft, HiChevronRight, HiPencil, HiCheck, HiXMark, HiTruck, HiCalendar, HiCog6Tooth, HiDocumentText, HiPlus } from 'react-icons/hi2'
import Card from '../../../../components/Card'
import Button from '../../../../components/Button'
import Input from '../../../../components/Input'
import { styles } from '../../../../styles/styles'
import { saveFormData } from '../../../../utils/formStorage'

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
  const router = useRouter()
  const [currentVehicleIndex, setCurrentVehicleIndex] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
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

  const handleNewRequest = () => {
    if (!currentVehicle) return

    // Map vehicle data to form data format
    const vehicleFormData = {
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
      engineNumber: currentVehicle.engineNumber || '',
      // Keep existing category and description if any
      category: '',
      description: '',
      estimatedPrice: null,
      // Save original vehicle data for comparison
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

    // Save vehicle data to localStorage
    saveFormData(vehicleFormData)

    // Navigate to landing page
    router.push('/')
  }

  if (vehicles.length === 0) {
    return (
      <Card variant="default" padding="lg">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <HiTruck className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className={`${styles.cardTitle} mb-2`}>Δεν υπάρχουν οχήματα</h3>
          <p className={styles.bodyText}>Δεν έχετε καταχωρήσει κάποιο όχημα ακόμα.</p>
        </div>
      </Card>
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

  return (
    <Card variant="default" padding="lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <HiTruck className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className={`${styles.sectionTitle} mb-0`}>Οχήματα</h2>
            {vehicles.length > 1 && (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-gray-500">
                  {currentVehicleIndex + 1} από {vehicles.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePrevious}
                    disabled={currentVehicleIndex === 0}
                    className={`p-1.5 rounded-lg transition-colors ${
                      currentVehicleIndex === 0
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <HiChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={currentVehicleIndex === vehicles.length - 1}
                    className={`p-1.5 rounded-lg transition-colors ${
                      currentVehicleIndex === vehicles.length - 1
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <HiChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            <HiPencil className="h-4 w-4" />
            Επεξεργασία
          </Button>
        )}
      </div>

      {/* Vehicle Title */}
      {(currentVehicle.nickname || currentVehicle.brand || currentVehicle.model) && (
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100 flex items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900">
              {currentVehicle.nickname || `${currentVehicle.brand} ${currentVehicle.model}`}
            </h3>
            {currentVehicle.nickname && (
              <p className="text-sm text-gray-600 mt-1">
                {currentVehicle.brand} {currentVehicle.model}
              </p>
            )}
          </div>
          {!isEditing && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleNewRequest}
            >
              <HiPlus className="h-4 w-4" />
              Νέο Αίτημα για αυτό το Όχημα
            </Button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="space-y-6">
        {/* Basic Information Section */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Βασικές Πληροφορίες
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Brand */}
            <div className="space-y-2">
              <label className={styles.label}>Μάρκα</label>
              {isEditing ? (
                <Input
                  type="text"
                  value={formData.brand || ''}
                  onChange={(value) => handleInputChange('brand', value)}
                  placeholder="Μάρκα"
                  required
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                    {currentVehicle.brand || '-'}
                  </p>
                </div>
              )}
            </div>

            {/* Model */}
            <div className="space-y-2">
              <label className={styles.label}>Μοντέλο</label>
              {isEditing ? (
                <Input
                  type="text"
                  value={formData.model || ''}
                  onChange={(value) => handleInputChange('model', value)}
                  placeholder="Μοντέλο"
                  required
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                    {currentVehicle.model || '-'}
                  </p>
                </div>
              )}
            </div>

            {/* Model Year */}
            <div className="space-y-2">
              <label className={styles.label}>Έτος Κατασκευής</label>
              {isEditing ? (
                <Input
                  type="text"
                  value={formData.modelYear || ''}
                  onChange={(value) => handleInputChange('modelYear', value)}
                  placeholder="π.χ. 2020"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                    {currentVehicle.modelYear || '-'}
                  </p>
                </div>
              )}
            </div>

            {/* Color */}
            <div className="space-y-2">
              <label className={styles.label}>Χρώμα</label>
              {isEditing ? (
                <Input
                  type="text"
                  value={formData.color || ''}
                  onChange={(value) => handleInputChange('color', value)}
                  placeholder="Χρώμα"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                    {currentVehicle.color || '-'}
                  </p>
                </div>
              )}
            </div>

            {/* License Plate */}
            <div className="space-y-2">
              <label className={styles.label}>Πινακίδα</label>
              {isEditing ? (
                <Input
                  type="text"
                  value={formData.licensePlate || ''}
                  onChange={(value) => handleInputChange('licensePlate', value)}
                  placeholder="π.χ. ABC-1234"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                    {currentVehicle.licensePlate || '-'}
                  </p>
                </div>
              )}
            </div>

            {/* Nickname - only show if editing or if it exists */}
            {(currentVehicle.nickname || isEditing) && (
              <div className="space-y-2">
                <label className={styles.label}>Ψευδώνυμο</label>
                {isEditing ? (
                  <Input
                    type="text"
                    value={formData.nickname || ''}
                    onChange={(value) => handleInputChange('nickname', value)}
                    placeholder="π.χ. Το αμάξι μου"
                  />
                ) : (
                  <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                    <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                      {currentVehicle.nickname || '-'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Technical Specifications Section */}
        <div className="pt-6 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
            <HiCog6Tooth className="h-4 w-4" />
            Τεχνικά Χαρακτηριστικά
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Engine CC */}
            <div className="space-y-2">
              <label className={styles.label}>Κυβισμός (cc)</label>
              {isEditing ? (
                <Input
                  type="text"
                  value={formData.engineCC || ''}
                  onChange={(value) => handleInputChange('engineCC', value)}
                  placeholder="π.χ. 1600"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                    {currentVehicle.engineCC || '-'} {currentVehicle.engineCC ? 'cc' : ''}
                  </p>
                </div>
              )}
            </div>

            {/* Fuel Type */}
            <div className="space-y-2">
              <label className={styles.label}>Καύσιμο</label>
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
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                    {fuelTypeText}
                  </p>
                </div>
              )}
            </div>

            {/* Transmission Type */}
            <div className="space-y-2">
              <label className={styles.label}>Μετάδοση</label>
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
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                    {currentVehicle.isAutomatic ? 'Αυτόματο' : 'Χειροκίνητο'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Identification Numbers Section */}
        <div className="pt-6 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
            <HiDocumentText className="h-4 w-4" />
            Αριθμοί Αναγνώρισης
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* VIN Number */}
            <div className="space-y-2">
              <label className={styles.label}>VIN Number</label>
              {isEditing ? (
                <Input
                  type="text"
                  value={formData.vinNumber || ''}
                  onChange={(value) => handleInputChange('vinNumber', value)}
                  placeholder="VIN Number"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <p className={`${styles.bodyText} text-gray-900 font-mono text-sm`}>
                    {currentVehicle.vinNumber || '-'}
                  </p>
                </div>
              )}
            </div>

            {/* Engine Number */}
            <div className="space-y-2">
              <label className={styles.label}>Αριθμός Κινητήρα</label>
              {isEditing ? (
                <Input
                  type="text"
                  value={formData.engineNumber || ''}
                  onChange={(value) => handleInputChange('engineNumber', value)}
                  placeholder="Αριθμός Κινητήρα"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <p className={`${styles.bodyText} text-gray-900 font-mono text-sm`}>
                    {currentVehicle.engineNumber || '-'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Action Buttons */}
      {isEditing && (
        <div className="flex gap-3 pt-6 mt-6 border-t border-gray-200">
          <Button
            variant="primary"
            onClick={handleSave}
            loading={isSubmitting}
            disabled={!formData.brand?.trim() || !formData.model?.trim()}
          >
            <HiCheck className="h-4 w-4" />
            Αποθήκευση
          </Button>
          <Button
            variant="secondary"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            <HiXMark className="h-4 w-4" />
            Ακύρωση
          </Button>
        </div>
      )}
    </Card>
  )
}
