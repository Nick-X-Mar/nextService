'use client'

import Card from './Card'
import { styles } from '@/styles/styles'
import { HiPencil } from 'react-icons/hi2'

interface VehicleDetails {
  brand?: string | null
  model?: string | null
  engineCC?: string | number | null
  modelYear?: string | number | null
  year?: string | number | null
  fuelType?: string | null
  isAutomatic?: boolean | string | null
  is4x4?: boolean | string | null
  isTurbo?: boolean | string | null
  vinNumber?: string | null
  engineNumber?: string | null
}

interface ServiceVehicleCardProps {
  title?: string
  serviceTitle?: string
  serviceDescription?: string | null
  category?: string | null
  estimatedCost?: number | string | null
  vehicle?: VehicleDetails | null
  photoCount?: number
  showCategory?: boolean
  showEstimatedCost?: boolean
  className?: string
  editable?: boolean
  onEditClick?: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  service: 'Συντήρηση',
  brakes: 'Φρένα',
  tires: 'Λάστιχα',
  engine: 'Κινητήρας',
  electrical: 'Ηλεκτρικά',
  oils: 'Λάδια & Υγρά',
  fanopeia: 'Φανοποιεία',
  disk: 'Δισκόφρενα'
}

const normalizeBoolean = (value?: boolean | string | null) => {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return null
}

const getBooleanText = (value?: boolean | string | null, fallback: string = 'Δεν έχει δηλωθεί') => {
  const normalized = normalizeBoolean(value)
  if (normalized === true) return 'Ναι'
  if (normalized === false) return 'Όχι'
  return fallback
}

const getTransmissionText = (value?: boolean | string | null) => {
  const normalized = normalizeBoolean(value)
  if (normalized === true) return 'Αυτόματο'
  if (normalized === false) return 'Χειροκίνητο'
  return 'Δεν έχει δηλωθεί'
}

const getFuelTypeText = (fuelType?: string | null) => {
  if (!fuelType) return 'Δεν έχει δηλωθεί'

  const normalized = fuelType.trim().toLowerCase()

  switch (normalized) {
    case 'petrol':
    case 'gasoline':
      return 'Βενζίνη'
    case 'diesel':
      return 'Πετρέλαιο'
    case 'hybrid':
      return 'Υβριδικό'
    case 'electric':
      return 'Ηλεκτρικό'
    case 'lpg':
      return 'Υγραέριο (LPG)'
    case 'cng':
      return 'Φυσικό Αέριο (CNG)'
    default:
      return fuelType
  }
}

const formatEngineCC = (engineCC?: string | number | null) => {
  if (engineCC === null || engineCC === undefined || engineCC === '') {
    return 'Δεν έχει δηλωθεί'
  }

  const value = typeof engineCC === 'number' ? engineCC.toString() : engineCC
  return `${value} cc`
}

const formatCurrency = (value?: number | string | null) => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numericValue = typeof value === 'string' ? Number(value) : value

  if (Number.isNaN(numericValue)) {
    return null
  }

  return new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(numericValue)
}

const getCategoryText = (category?: string | null) => {
  if (!category) {
    return 'Δεν έχει δηλωθεί'
  }

  const normalized = category.trim().toLowerCase()
  return CATEGORY_LABELS[normalized] || category
}

export default function ServiceVehicleCard({
  title = 'Εργασία - Όχημα',
  serviceTitle = 'Εργασία',
  serviceDescription,
  category,
  estimatedCost,
  vehicle,
  photoCount = 0,
  showCategory = true,
  showEstimatedCost = true,
  className = '',
  editable = false,
  onEditClick
}: ServiceVehicleCardProps) {
  const serviceText =
    serviceDescription && serviceDescription.trim() !== ''
      ? serviceDescription
      : 'Δεν έχει δηλωθεί'

  const formattedEstimatedCost = showEstimatedCost ? formatCurrency(estimatedCost) : null

  const modelYear =
    vehicle?.modelYear ??
    vehicle?.year ??
    ''

  const modelYearText =
    modelYear !== '' && modelYear !== null && modelYear !== undefined
      ? modelYear.toString()
      : 'Δεν έχει δηλωθεί'

  return (
    <Card className={`p-6 ${className}`}>
      <div className="mb-4 flex items-start justify-between">
        <h2 className={`${styles.sectionTitle}`}>{title}</h2>
        {editable && (
          <button
            type="button"
            onClick={onEditClick}
            className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:border-orange-300 hover:text-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            aria-label="Επεξεργασία στοιχείων οχήματος"
          >
            <HiPencil className="h-4 w-4" />
          </button>
        )}
      </div>

      {(serviceDescription !== undefined || showCategory) && (
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">{serviceTitle}</p>
            <p className="font-medium text-gray-900">{serviceText}</p>
          </div>
          {showCategory && (
            <div>
              <p className="text-sm text-gray-600">Κατηγορία</p>
              <p className="font-medium text-gray-900">{getCategoryText(category)}</p>
            </div>
          )}
        </div>
      )}

      {formattedEstimatedCost && (
        <div className="mb-6">
          <p className="text-sm text-gray-600">Εκτιμώμενο Κόστος</p>
          <p className="font-medium text-gray-900">{formattedEstimatedCost}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <p className="text-sm text-gray-600">Μάρκα</p>
          <p className="font-medium text-gray-900">{vehicle?.brand || 'Δεν έχει δηλωθεί'}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Μοντέλο</p>
          <p className="font-medium text-gray-900">{vehicle?.model || 'Δεν έχει δηλωθεί'}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Κυβικά</p>
          <p className="font-medium text-gray-900">{formatEngineCC(vehicle?.engineCC)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Έτος</p>
          <p className="font-medium text-gray-900">{modelYearText}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Καύσιμο</p>
          <p className="font-medium text-gray-900">{getFuelTypeText(vehicle?.fuelType)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Κιβώτιο Ταχυτήτων</p>
          <p className="font-medium text-gray-900">{getTransmissionText(vehicle?.isAutomatic)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">4x4</p>
          <p className="font-medium text-gray-900">{getBooleanText(vehicle?.is4x4, 'Όχι')}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Turbo</p>
          <p className="font-medium text-gray-900">{getBooleanText(vehicle?.isTurbo, 'Όχι')}</p>
        </div>
        {vehicle?.vinNumber && (
          <div>
            <p className="text-sm text-gray-600">VIN</p>
            <p className="font-medium text-gray-900">{vehicle.vinNumber}</p>
          </div>
        )}
        {vehicle?.engineNumber && (
          <div>
            <p className="text-sm text-gray-600">Αρ. Κινητήρα</p>
            <p className="font-medium text-gray-900">{vehicle.engineNumber}</p>
          </div>
        )}
      </div>

      {photoCount > 0 && (
        <div className="mt-6 flex items-center gap-2 text-green-600">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium text-green-700">
            Φωτογραφίες ({photoCount})
          </span>
        </div>
      )}
    </Card>
  )
}

