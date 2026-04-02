'use client'

import { styles } from '@/styles/styles'
import Icon from '@/components/ui/Icon'
import { getCategoryText } from '@/utils/categoryLabels'

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

const getCategoryTextOrDefault = (category?: string | null) => {
  if (!category) {
    return 'Δεν έχει δηλωθεί'
  }
  return getCategoryText(category)
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
    <div className={`bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 ${className}`}>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="build" size="md" className="text-primary" filled />
          <p className={styles.labelUpper}>{title}</p>
        </div>
        {editable && (
          <button
            type="button"
            onClick={onEditClick}
            className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-highest transition-colors"
            aria-label="Επεξεργασία στοιχείων οχήματος"
          >
            <Icon name="edit" size="sm" className="text-on-surface-variant" />
          </button>
        )}
      </div>

      {(serviceDescription !== undefined || showCategory) && (
        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className={styles.label}>{serviceTitle}</p>
            <p className="text-sm font-medium text-on-surface mt-1">{serviceText}</p>
          </div>
          {showCategory && (
            <div>
              <p className={styles.label}>Κατηγορία</p>
              <p className="text-sm font-medium text-on-surface mt-1">{getCategoryTextOrDefault(category)}</p>
            </div>
          )}
        </div>
      )}

      {formattedEstimatedCost && (
        <div className="mb-5">
          <p className={styles.label}>Εκτιμώμενο Κόστος</p>
          <p className="text-sm font-medium text-on-surface mt-1">{formattedEstimatedCost}</p>
        </div>
      )}

      <div className={styles.specGrid}>
        <div className={styles.specCell}>
          <p className={styles.specLabel}>Μάρκα</p>
          <p className={styles.specValue}>{vehicle?.brand || '--'}</p>
        </div>
        <div className={styles.specCell}>
          <p className={styles.specLabel}>Μοντέλο</p>
          <p className={styles.specValue}>{vehicle?.model || '--'}</p>
        </div>
        <div className={styles.specCell}>
          <p className={styles.specLabel}>Κυβικά</p>
          <p className={styles.specValue}>{formatEngineCC(vehicle?.engineCC)}</p>
        </div>
        <div className={styles.specCell}>
          <p className={styles.specLabel}>Έτος</p>
          <p className={styles.specValue}>{modelYearText}</p>
        </div>
        <div className={styles.specCell}>
          <p className={styles.specLabel}>Καύσιμο</p>
          <p className={styles.specValue}>{getFuelTypeText(vehicle?.fuelType)}</p>
        </div>
        <div className={styles.specCell}>
          <p className={styles.specLabel}>Κιβώτιο</p>
          <p className={styles.specValue}>{getTransmissionText(vehicle?.isAutomatic)}</p>
        </div>
        <div className={styles.specCell}>
          <p className={styles.specLabel}>4x4</p>
          <p className={styles.specValue}>{getBooleanText(vehicle?.is4x4, 'Όχι')}</p>
        </div>
        <div className={styles.specCell}>
          <p className={styles.specLabel}>Turbo</p>
          <p className={styles.specValue}>{getBooleanText(vehicle?.isTurbo, 'Όχι')}</p>
        </div>
        {vehicle?.vinNumber && (
          <div className={styles.specCell}>
            <p className={styles.specLabel}>VIN</p>
            <p className={`${styles.specValue} text-[10px]`}>{vehicle.vinNumber}</p>
          </div>
        )}
        {vehicle?.engineNumber && (
          <div className={styles.specCell}>
            <p className={styles.specLabel}>Αρ. Κινητήρα</p>
            <p className={`${styles.specValue} text-[10px]`}>{vehicle.engineNumber}</p>
          </div>
        )}
      </div>

      {photoCount > 0 && (
        <div className="mt-5 flex items-center gap-2">
          <Icon name="check_circle" size="sm" className="text-green-600" filled />
          <span className="text-xs font-bold text-green-700">
            Φωτογραφίες ({photoCount})
          </span>
        </div>
      )}
    </div>
  )
}
