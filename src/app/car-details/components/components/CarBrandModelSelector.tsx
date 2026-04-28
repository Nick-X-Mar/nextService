import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import GearSubmitButton from '@/components/GearSubmitButton'
import { saveFormData, loadFormData, clearFormData } from '../../../../utils/formStorage'
import { useToast } from '../../../../hooks/useToast'

// Greek to Latin phonetic transliteration for search matching
const greekToLatinMap: Record<string, string> = {
  // Digraphs first (order matters)
  'μπ': 'b', 'ντ': 'nt', 'γκ': 'g', 'γγ': 'ng', 'τσ': 'ts', 'τζ': 'tz',
  'ου': 'ou', 'αι': 'ai', 'ει': 'ei', 'οι': 'oi', 'αυ': 'au', 'ευ': 'eu',
  // Single characters
  'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z',
  'η': 'i', 'θ': 'th', 'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm',
  'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's',
  'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
  // Accented vowels
  'ά': 'a', 'έ': 'e', 'ή': 'i', 'ί': 'i', 'ό': 'o', 'ύ': 'y', 'ώ': 'o',
  'ϊ': 'i', 'ϋ': 'y', 'ΐ': 'i', 'ΰ': 'y',
}

// Generate multiple transliteration variants for ambiguous Greek sounds
function greekToLatinVariants(text: string): string[] {
  const lower = text.toLowerCase()
  let variants: string[] = ['']
  let i = 0
  while (i < lower.length) {
    let options: string[] = []
    // Try digraph first
    if (i + 1 < lower.length) {
      const pair = lower[i] + lower[i + 1]
      if (pair === 'ου') { options = ['ou', 'oo', 'u']; i += 2 }
      else if (pair === 'αι') { options = ['ai', 'e']; i += 2 }
      else if (pair === 'ει') { options = ['ei', 'i']; i += 2 }
      else if (pair === 'οι') { options = ['oi', 'i']; i += 2 }
      else if (pair === 'αυ') { options = ['au', 'av', 'af']; i += 2 }
      else if (pair === 'ευ') { options = ['eu', 'ev', 'ef']; i += 2 }
      else if (greekToLatinMap[pair]) { options = [greekToLatinMap[pair]]; i += 2 }
    }
    if (options.length === 0) {
      const ch = lower[i]
      // Ambiguous single chars
      if (ch === 'υ' || ch === 'ύ' || ch === 'ϋ' || ch === 'ΰ') { options = ['y', 'u', 'i'] }
      else if (ch === 'η' || ch === 'ή') { options = ['i', 'e'] }
      else if (ch === 'σ' || ch === 'ς') { options = ['s', 'c'] }
      else if (ch === 'κ') { options = ['k', 'c'] }
      else { options = [greekToLatinMap[ch] || ch] }
      i++
    }
    // Expand variants (cap at 32 to avoid explosion)
    const newVariants: string[] = []
    for (const v of variants) {
      for (const o of options) {
        newVariants.push(v + o)
        if (newVariants.length >= 32) break
      }
      if (newVariants.length >= 32) break
    }
    variants = newVariants
  }
  return variants
}

function fuzzyMatch(item: string, query: string): boolean {
  const q = query.toLowerCase()
  const target = item.toLowerCase()
  // Direct match
  if (target.includes(q)) return true
  // Check if query has any Greek characters
  if (/[α-ωάέήίόύώϊϋΐΰ]/.test(q)) {
    const variants = greekToLatinVariants(q)
    for (const v of variants) {
      if (target.includes(v)) return true
    }
  }
  return false
}

// Car brands and their models
const carBrands = {
  'toyota': ['Yaris', 'Corolla', 'Camry', 'Prius', 'RAV4', 'C-HR', 'Highlander', 'Land Cruiser', 'Hilux', 'Auris', 'Avensis', 'Verso', 'Aygo', 'GT86', 'Supra'],
  'volkswagen': ['Polo', 'Golf', 'Jetta', 'Passat', 'Arteon', 'Tiguan', 'Touareg', 'T-Cross', 'T-Roc', 'Touran', 'Sharan', 'Caddy', 'Crafter', 'Amarok', 'Beetle', 'Scirocco'],
  'bmw': ['Series 1', 'Series 2', 'Series 3', 'Series 4', 'Series 5', 'Series 6', 'Series 7', 'Series 8', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4', 'i3', 'i4', 'iX3'],
  'mercedes': ['A-Class', 'B-Class', 'C-Class', 'CLA', 'CLS', 'E-Class', 'S-Class', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'G-Class', 'AMG GT', 'SL', 'SLC', 'V-Class', 'Sprinter'],
  'audi': ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'TT', 'R8', 'e-tron GT', 'RS3', 'RS4', 'RS6'],
  'ford': ['Fiesta', 'Focus', 'Mondeo', 'Mustang', 'EcoSport', 'Kuga', 'Edge', 'Explorer', 'Ranger', 'Transit', 'Transit Custom', 'B-Max', 'C-Max', 'S-Max', 'Galaxy', 'Ka+'],
  'opel': ['Corsa', 'Astra', 'Insignia', 'Mokka', 'Crossland', 'Grandland', 'Combo', 'Vivaro', 'Movano', 'Adam', 'Meriva', 'Zafira', 'Antara', 'Cascada'],
  'peugeot': ['108', '208', '308', '508', '2008', '3008', '5008', 'Partner', 'Rifter', 'Expert', 'Boxer', '107', '206', '207', '307', '407', '607', 'RCZ'],
  'renault': ['Twingo', 'Clio', 'Megane', 'Talisman', 'Captur', 'Kadjar', 'Koleos', 'Scenic', 'Espace', 'Kangoo', 'Trafic', 'Master', 'Zoe', 'Fluence', 'Laguna'],
  'nissan': ['Micra', 'Note', 'Sentra', 'Altima', 'Maxima', 'Juke', 'Qashqai', 'X-Trail', 'Murano', 'Pathfinder', 'Patrol', 'Navara', 'Leaf', 'e-NV200', '370Z', 'GT-R'],
  'hyundai': ['i10', 'i20', 'i30', 'i40', 'Elantra', 'Sonata', 'Genesis', 'Kona', 'Tucson', 'Santa Fe', 'Palisade', 'Ioniq', 'Nexo', 'H1', 'H350', 'Accent', 'Veloster'],
  'kia': ['Picanto', 'Rio', 'Ceed', 'Forte', 'Optima', 'Stinger', 'Stonic', 'Xceed', 'Sportage', 'Sorento', 'Mohave', 'Soul', 'Niro', 'EV6', 'Carnival', 'Venga'],
  'honda': ['Jazz', 'Civic', 'Accord', 'Insight', 'HR-V', 'CR-V', 'Pilot', 'Ridgeline', 'Odyssey', 'NSX', 'City', 'Fit', 'CR-Z', 'S2000', 'Element'],
  'mazda': ['Mazda2', 'Mazda3', 'Mazda6', 'MX-5', 'CX-3', 'CX-30', 'CX-5', 'CX-7', 'CX-9', 'RX-8', 'BT-50', 'Premacy', 'MPV', 'Tribute'],
  'suzuki': ['Alto', 'Swift', 'Baleno', 'Ciaz', 'Ignis', 'S-Cross', 'Vitara', 'Jimny', 'Grand Vitara', 'SX4', 'Splash', 'Celerio', 'Ertiga', 'XL7'],
  'seat': ['Ibiza', 'Leon', 'Toledo', 'Arona', 'Ateca', 'Tarraco', 'Alhambra', 'Mii', 'Altea', 'Exeo', 'Cordoba', 'Cupra Formentor', 'Cupra Leon'],
  'skoda': ['Citigo', 'Fabia', 'Scala', 'Octavia', 'Superb', 'Kamiq', 'Karoq', 'Kodiaq', 'Roomster', 'Rapid', 'Yeti', 'Enyaq', 'Praktik'],
  'fiat': ['Panda', '500', 'Tipo', 'Punto', 'Bravo', 'Linea', '500X', '500L', 'Doblo', 'Freemont', 'Sedici', 'Croma', 'Stilo', 'Multipla', 'Ducato'],
  'alfa romeo': ['MiTo', 'Giulietta', 'Giulia', 'Stelvio', 'Tonale', '4C', '159', '166', 'Brera', 'Spider', 'GT', '147', '156', 'GTV'],
  'citroen': ['C1', 'C3', 'C4', 'C5', 'C6', 'C3 Aircross', 'C4 Cactus', 'C5 Aircross', 'Berlingo', 'SpaceTourer', 'Jumper', 'Xsara', 'Picasso', 'DS3', 'DS4', 'DS5'],
  'mitsubishi': ['Mirage', 'Lancer', 'Galant', 'Eclipse', 'ASX', 'Outlander', 'Pajero', 'L200', 'i-MiEV', 'Colt', 'Carisma', 'Grandis', 'Shogun'],
  'volvo': ['V40', 'V60', 'V70', 'V90', 'S60', 'S80', 'S90', 'XC40', 'XC60', 'XC70', 'XC90', 'C30', 'C70', '850', '940', '960'],
  'dacia': ['Sandero', 'Logan', 'Duster', 'Lodgy', 'Dokker', 'Spring', 'Jogger', 'Solenza', 'Nova', 'SupeRNova'],
  'chevrolet': ['Spark', 'Aveo', 'Cruze', 'Malibu', 'Impala', 'Camaro', 'Corvette', 'Trax', 'Equinox', 'Traverse', 'Tahoe', 'Suburban', 'Silverado'],
}

export default function CarBrandModelSelector() {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [isBrandOther, setIsBrandOther] = useState(false)
  const [isModelOther, setIsModelOther] = useState(false)
  const [customBrand, setCustomBrand] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [description, setDescription] = useState('')
  const [descriptionPhotos, setDescriptionPhotos] = useState<File[]>([])
  const [category, setCategory] = useState('')
  const [engineCC, setEngineCC] = useState('')
  const [modelYear, setModelYear] = useState('')
  const [fuelType, setFuelType] = useState<'petrol' | 'diesel' | ''>('petrol')
  const [isAutomatic, setIsAutomatic] = useState(false)
  const [is4x4, setIs4x4] = useState(false)
  const [isTurbo, setIsTurbo] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Vehicle selector for logged-in users
  interface Vehicle {
    id: string
    brand: string
    model: string
    modelYear?: string
    engineCC?: string
    fuelType?: string
    isAutomatic?: boolean
    is4x4?: boolean
    isTurbo?: boolean
    vinNumber?: string
    engineNumber?: string
    licensePhotoUrl?: string
  }
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('')

  const [brandOpen, setBrandOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [brandSearch, setBrandSearch] = useState('')
  const [modelSearch, setModelSearch] = useState('')
  const brandRef = useRef<HTMLDivElement>(null)
  const modelRef = useRef<HTMLDivElement>(null)
  const brandSearchRef = useRef<HTMLInputElement>(null)
  const modelSearchRef = useRef<HTMLInputElement>(null)

  const availableModels = !isBrandOther && brand ? carBrands[brand as keyof typeof carBrands] || [] : []
  const filteredBrands = Object.keys(carBrands).filter(b =>
    fuzzyMatch(b, brandSearch)
  )
  const filteredModels = availableModels.filter(m =>
    fuzzyMatch(m, modelSearch)
  )
  const currentBrand = isBrandOther ? customBrand : brand
  const currentModel = (isModelOther || isBrandOther) ? customModel : model

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (brandRef.current && !brandRef.current.contains(e.target as Node)) { setBrandOpen(false); setBrandSearch('') }
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) { setModelOpen(false); setModelSearch('') }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Validation for model year (4 digits only)
  const handleModelYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Only allow digits and limit to 4 characters
    if (/^\d{0,4}$/.test(value)) {
      setModelYear(value)
    }
  }

  // Validation for engine CC (numbers only, reasonable range 100-9999)
  const handleEngineCCChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Only allow digits and limit to 4 characters
    if (/^\d{0,4}$/.test(value)) {
      setEngineCC(value)
    }
  }

  // Check if CC is in reasonable range
  const isCCValid = (cc: string) => {
    if (!cc || cc.length === 0) return false
    const ccNumber = parseInt(cc)
    return ccNumber >= 100 && ccNumber <= 9999
  }


  // Track form funnel
  useEffect(() => {
    const clientId = typeof window !== 'undefined' ? localStorage.getItem('clientId') : null
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'car_details_started', clientId, metadata: { category } }),
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load only category/description on mount; vehicle fields start fresh
  useEffect(() => {
    setMounted(true)
    const data = loadFormData()
    if (data.category) setCategory(data.category)
    if (data.description) setDescription(data.description)

    // Clear stale vehicle fields from previous requests
    clearFormData()
    if (data.category || data.description) {
      saveFormData({ category: data.category, description: data.description })
    }

    // Fetch user's vehicles if logged in
    const clientId = localStorage.getItem('clientId')
    if (clientId) {
      fetch(`/api/clients/${clientId}/vehicles`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.vehicles?.length > 0) {
            setVehicles(data.vehicles.filter((v: Vehicle) => v.brand && v.model))
          }
        })
        .catch(() => {})
    }
  }, [])

  // Save data whenever it changes
  useEffect(() => {
    if (mounted) {
      saveFormData({
        brand: currentBrand,
        model: currentModel,
        description,
        isBrandOther,
        isModelOther,
        customBrand,
        customModel,
        engineCC,
        modelYear,
        fuelType,
        isAutomatic,
        is4x4,
        isTurbo
      })
    }
  }, [currentBrand, currentModel, description, isBrandOther, isModelOther, customBrand, customModel, engineCC, modelYear, fuelType, isAutomatic, is4x4, isTurbo, mounted])

  // Check if year is valid (4 digits, not in the future)
  const isYearValid = (year: string) => {
    if (year.length !== 4 || !/^\d{4}$/.test(year)) return false
    const currentYear = new Date().getFullYear()
    return parseInt(year) <= currentYear
  }

  // Fill form from a saved vehicle
  const selectVehicle = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId)
    if (!vehicleId) {
      // "Νέο Όχημα" — reset all fields
      setBrand(''); setModel(''); setIsBrandOther(false); setIsModelOther(false)
      setCustomBrand(''); setCustomModel(''); setEngineCC(''); setModelYear('')
      setFuelType('petrol'); setIsAutomatic(false); setIs4x4(false); setIsTurbo(false)
      return
    }
    const v = vehicles.find(v => v.id === vehicleId)
    if (!v) return

    // Set brand
    const brandKey = Object.keys(carBrands).find(b => b === v.brand.toLowerCase())
    if (brandKey) {
      setIsBrandOther(false); setCustomBrand(''); setBrand(brandKey)
      // Set model
      const models = carBrands[brandKey as keyof typeof carBrands] || []
      if (v.model && models.includes(v.model)) {
        setIsModelOther(false); setCustomModel(''); setModel(v.model)
      } else {
        setIsModelOther(true); setCustomModel(v.model || '')
      }
    } else {
      setIsBrandOther(true); setCustomBrand(v.brand || ''); setBrand('')
      setIsModelOther(true); setCustomModel(v.model || '')
    }

    if (v.modelYear) setModelYear(v.modelYear)
    if (v.engineCC) setEngineCC(v.engineCC)
    if (v.fuelType) setFuelType(v.fuelType as 'petrol' | 'diesel')
    if (v.isAutomatic !== undefined) setIsAutomatic(v.isAutomatic)
    if (v.is4x4 !== undefined) setIs4x4(v.is4x4)
    if (v.isTurbo !== undefined) setIsTurbo(v.isTurbo)

    // Save vehicle data for the next step (car-specifications)
    saveFormData({
      vinNumber: v.vinNumber || '',
      engineNumber: v.engineNumber || '',
      originalVehicleId: v.id,
      originalVehicleLicensePhotoUrl: v.licensePhotoUrl || '',
      originalVehicleData: {
        brand: v.brand, model: v.model, modelYear: v.modelYear,
        engineCC: v.engineCC, fuelType: v.fuelType,
        isAutomatic: v.isAutomatic, is4x4: v.is4x4,
        vinNumber: v.vinNumber, engineNumber: v.engineNumber
      }
    })
  }

  // Bodywork categories don't need engine/fuel/transmission details
  const isBodywork = category === 'oliki-vafi' || category === 'meriki-vafi' || category === 'fanopeia'

  // Form validation
  const isFormValid =
    currentBrand.trim() !== '' &&
    currentModel.trim() !== '' &&
    isYearValid(modelYear) &&
    (isBodywork ? descriptionPhotos.length >= 1 : (isCCValid(engineCC) && fuelType !== ''))

  const handleSubmit = async () => {
    if (!isFormValid) return

    saveFormData({
      brand: currentBrand,
      model: currentModel,
      description,
      isBrandOther,
      isModelOther,
      customBrand,
      customModel,
      engineCC,
      modelYear,
      fuelType,
      isAutomatic,
      is4x4,
      isTurbo
    })
    const clientId = localStorage.getItem('clientId')
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: 'car_details_completed',
        clientId,
        metadata: { brand: currentBrand, model: currentModel, isBrandOther, isModelOther, category },
      }),
    }).catch(() => {})

    // Bodywork: submit directly with photos, skip second page
    if (isBodywork) {
      if (descriptionPhotos.length < 1) {
        showError('Σφάλμα', 'Ανεβάστε τουλάχιστον 1 φωτογραφία')
        return
      }
      setIsSubmitting(true)
      try {
        const latestFormData = loadFormData()
        // For bodywork, include the original vehicle's engine data so
        // the backend comparison doesn't see a diff and create a clone.
        const origData = latestFormData.originalVehicleData
        const serviceRequestData = {
          category, description, brand: currentBrand, model: currentModel,
          modelYear, isBrandOther, isModelOther,
          engineCC: origData?.engineCC || engineCC,
          fuelType: origData?.fuelType || fuelType,
          isAutomatic: origData?.isAutomatic ?? isAutomatic,
          is4x4: origData?.is4x4 ?? is4x4,
          vinNumber: origData?.vinNumber || '',
          engineNumber: origData?.engineNumber || '',
          photos: descriptionPhotos.map(p => ({ name: p.name, size: p.size, type: p.type })),
          ...(latestFormData.originalVehicleId && { originalVehicleId: latestFormData.originalVehicleId }),
          ...(origData && { originalVehicleData: origData }),
          ...(clientId && { clientId })
        }
        const serviceResponse = await fetch('/api/service-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(serviceRequestData),
        })
        const serviceResult = await serviceResponse.json()
        if (!serviceResponse.ok || !serviceResult.success) {
          showError('Σφάλμα', serviceResult.error || 'Σφάλμα κατά την αποστολή')
          return
        }
        // Upload photos to S3
        const formData = new FormData()
        descriptionPhotos.forEach(file => formData.append('files', file))
        formData.append('serviceRequestId', serviceResult.serviceRequestId)
        formData.append('vehicleId', serviceResult.vehicleId)
        const uploadRes = await fetch('/api/upload-photos', { method: 'POST', body: formData })
        const uploadData = await uploadRes.json().catch(() => ({}))
        const photosUploaded = uploadData.success === true

        if (photosUploaded) {
          success('Επιτυχία!', `Στάλθηκαν ${descriptionPhotos.length} φωτογραφίες\n\nΕιδοποίηση σε ${serviceResult.notificationsSent} συνεργεία μέσω SMS!`)
        } else {
          success('Αίτημα Υποβλήθηκε', `Ειδοποίηση σε ${serviceResult.notificationsSent} συνεργεία μέσω SMS!\n\nΟι φωτογραφίες δεν ανέβηκαν — δοκιμάστε ξανά αργότερα.`)
        }
        if (serviceResult.clientId) router.push(`/requests/${serviceResult.clientId}/`)
        else if (clientId) router.push(`/requests/${clientId}/`)
        else router.push('/requests/')
      } catch {
        showError('Σφάλμα', 'Σφάλμα κατά την αποστολή. Δοκιμάστε ξανά.')
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    router.push('/car-specifications/')
  }

  return (
    <div className="mt-6">
      {/* Main form card */}
      <div className="bg-surface-container-lowest rounded-3xl shadow-[0_4px_24px_rgba(27,28,28,0.04)] p-6">
        <div className="space-y-8">

          {/* Description */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              Περιγραφή Προβλήματος
            </label>
            <textarea
              className="w-full bg-surface-container-highest rounded-xl px-4 py-3 border-none focus:ring-2 focus:ring-primary font-medium text-sm resize-none"
              rows={3}
              placeholder="Περιγράψτε τι χρειάζεται το αυτοκίνητό σας..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            {/* Photo upload area - bodywork categories */}
            {isBodywork && (
              <>
                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                    Φωτογραφίες Ζημιάς ({descriptionPhotos.length}/3)
                  </label>

                  {descriptionPhotos.length < 3 && (
                    <div
                      className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 ${
                        dragActive
                          ? 'border-primary bg-primary/5'
                          : 'border-outline-variant/30 hover:border-primary'
                      }`}
                      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true) }}
                      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false) }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true) }}
                      onDrop={(e) => {
                        e.preventDefault(); e.stopPropagation(); setDragActive(false)
                        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
                        setDescriptionPhotos(prev => [...prev, ...files].slice(0, 3))
                      }}
                    >
                      <input
                        type="file"
                        id="bodywork-photos"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
                          setDescriptionPhotos(prev => [...prev, ...files].slice(0, 3))
                          e.target.value = ''
                        }}
                        className="hidden"
                      />
                      <label htmlFor="bodywork-photos" className="cursor-pointer">
                        <Icon name="cloud_upload" size="xl" className="mx-auto mb-3 text-on-surface-variant/40" />
                        <p className="text-sm font-bold text-on-surface">
                          Κάνε κλικ ή σύρε φωτογραφίες εδώ
                        </p>
                        <p className="text-xs text-on-surface-variant mt-1">
                          JPG, PNG μέχρι 10MB ανά φωτογραφία
                        </p>
                        <p className="text-[10px] text-on-surface-variant/50 mt-1">
                          Μέχρι {3 - descriptionPhotos.length} ακόμα φωτογραφί{3 - descriptionPhotos.length === 1 ? 'α' : 'ες'}
                        </p>
                      </label>
                    </div>
                  )}

                  {descriptionPhotos.length > 0 && (
                    <div className="grid grid-cols-3 gap-3">
                      {descriptionPhotos.map((photo, index) => (
                        <div key={index} className="relative group">
                          <div className="relative aspect-square bg-surface-container rounded-xl overflow-hidden">
                            <Image
                              src={URL.createObjectURL(photo)}
                              alt={`Φωτογραφία ${index + 1}`}
                              fill
                              className="object-cover"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setDescriptionPhotos(prev => prev.filter((_, i) => i !== index))}
                            className="absolute -top-2 -right-2 bg-tertiary text-on-tertiary rounded-full h-6 w-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md"
                          >
                            <Icon name="close" size="sm" />
                          </button>
                          <p className="text-[10px] text-on-surface-variant mt-1 truncate">{photo.name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tips card */}
                <div className="p-4 bg-surface-container-lowest rounded-2xl">
                  <div className="flex items-start gap-3">
                    <Icon name="lightbulb" size="md" className="text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-on-surface mb-1">Συμβουλές για καλές φωτογραφίες:</h4>
                      <ul className="text-[11px] text-on-surface-variant space-y-0.5">
                        <li>Φωτογραφίστε τη ζημιά από κοντά και από μακριά</li>
                        <li>Χρησιμοποιήστε καλό φωτισμό (φυσικό φως)</li>
                        <li>Συμπεριλάβετε το περιβάλλον της ζημιάς</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Vehicle selector for logged-in users */}
          {vehicles.length > 0 && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                <Icon name="directions_car" size="sm" className="text-primary inline-block mr-1 align-text-bottom" />
                Τα Οχήματά μου
              </label>
              <select
                value={selectedVehicleId}
                onChange={(e) => selectVehicle(e.target.value)}
                className="w-full h-14 bg-surface-container-highest rounded-xl px-4 border-none focus:ring-2 focus:ring-primary font-bold text-sm text-on-surface cursor-pointer appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23666' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
              >
                <option value="">Νέο Όχημα</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.brand.charAt(0).toUpperCase() + v.brand.slice(1)} {v.model} {v.modelYear ? `(${v.modelYear})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Brand */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              Μάρκα <span className="text-error">*</span>
            </label>
            <div className="relative" ref={brandRef}>
              <div
                onClick={() => { setBrandOpen(!brandOpen); setModelOpen(false); setBrandSearch(''); setTimeout(() => brandSearchRef.current?.focus(), 50) }}
                className="w-full h-14 bg-surface-container-highest rounded-xl px-4 flex items-center justify-between cursor-pointer"
              >
                <span className={`font-bold text-base ${currentBrand ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>
                  {isBrandOther ? 'Άλλο' : brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Επιλέξτε...'}
                </span>
                <Icon name={brandOpen ? 'expand_less' : 'expand_more'} className="text-on-surface-variant" />
              </div>
              {brandOpen && (
                <div className="absolute z-50 left-0 right-0 top-[60px] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/10 max-h-[320px] overflow-y-auto p-2 space-y-1">
                  <div className="sticky top-0 bg-surface-container-lowest pb-1">
                    <div className="relative">
                      <Icon name="search" size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
                      <input
                        ref={brandSearchRef}
                        type="text"
                        value={brandSearch}
                        onChange={(e) => setBrandSearch(e.target.value)}
                        placeholder="Αναζήτηση μάρκας..."
                        className="w-full h-10 bg-surface-container-highest rounded-xl pl-9 pr-4 border-none focus:ring-2 focus:ring-primary text-sm font-medium"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  {filteredBrands.map((b) => (
                    <div
                      key={b}
                      onClick={() => {
                        setIsBrandOther(false); setCustomBrand(''); setBrand(b)
                        setIsModelOther(false); setCustomModel(''); setModel('')
                        setBrandOpen(false)
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                        brand === b && !isBrandOther ? 'bg-primary/10' : 'bg-surface-container hover:bg-surface-container-high'
                      }`}
                    >
                      <span className={`text-base font-bold ${brand === b && !isBrandOther ? 'text-primary' : 'text-on-surface'}`}>
                        {b.charAt(0).toUpperCase() + b.slice(1)}
                      </span>
                      {brand === b && !isBrandOther && <Icon name="check" size="sm" className="text-primary" />}
                    </div>
                  ))}
                  {!brandSearch && (
                    <div
                      onClick={() => {
                        setIsBrandOther(true); setBrand('')
                        setIsModelOther(false); setCustomModel(''); setModel('')
                        setBrandOpen(false)
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                        isBrandOther ? 'bg-primary/10' : 'bg-surface-container hover:bg-surface-container-high'
                      }`}
                    >
                      <span className={`text-base font-bold ${isBrandOther ? 'text-primary' : 'text-on-surface'}`}>
                        Άλλο
                      </span>
                      {isBrandOther && <Icon name="check" size="sm" className="text-primary" />}
                    </div>
                  )}
                  {filteredBrands.length === 0 && brandSearch && (
                    <div className="p-2 space-y-2">
                      <p className="text-center text-xs text-on-surface-variant/50">Δεν βρέθηκε μάρκα</p>
                      <div
                        onClick={() => {
                          setIsBrandOther(true); setBrand(''); setCustomBrand(brandSearch)
                          setIsModelOther(false); setCustomModel(''); setModel('')
                          setBrandOpen(false); setBrandSearch('')
                        }}
                        className="flex items-center gap-3 p-3 rounded-xl cursor-pointer bg-tertiary/10 hover:bg-tertiary/20 transition-colors"
                      >
                        <Icon name="add_circle" size="sm" className="text-tertiary" />
                        <span className="text-sm font-bold text-on-surface">
                          Συνέχεια με &ldquo;<span className="text-tertiary">{brandSearch}</span>&rdquo;
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Custom Brand */}
          {isBrandOther && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                Μάρκα (Άλλο) <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={customBrand}
                onChange={(e) => setCustomBrand(e.target.value)}
                placeholder="π.χ. Lada, Smart..."
                className="w-full h-14 bg-surface-container-highest rounded-xl px-4 border-none focus:ring-2 focus:ring-primary font-bold text-sm"
              />
            </div>
          )}

          {/* Model */}
          {(brand || isBrandOther) && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                Μοντέλο <span className="text-error">*</span>
              </label>
              {!isBrandOther ? (
                <div className="relative" ref={modelRef}>
                  <div
                    onClick={() => { setModelOpen(!modelOpen); setBrandOpen(false); setModelSearch(''); setTimeout(() => modelSearchRef.current?.focus(), 50) }}
                    className="w-full h-14 bg-surface-container-highest rounded-xl px-4 flex items-center justify-between cursor-pointer"
                  >
                    <span className={`font-bold text-base ${model ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>
                      {isModelOther ? 'Άλλο' : model || 'Επιλέξτε...'}
                    </span>
                    <Icon name={modelOpen ? 'expand_less' : 'expand_more'} className="text-on-surface-variant" />
                  </div>
                  {modelOpen && (
                    <div className="absolute z-50 left-0 right-0 top-[60px] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/10 max-h-[320px] overflow-y-auto p-2 space-y-1">
                      <div className="sticky top-0 bg-surface-container-lowest pb-1">
                        <div className="relative">
                          <Icon name="search" size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
                          <input
                            ref={modelSearchRef}
                            type="text"
                            value={modelSearch}
                            onChange={(e) => setModelSearch(e.target.value)}
                            placeholder="Αναζήτηση μοντέλου..."
                            className="w-full h-10 bg-surface-container-highest rounded-xl pl-9 pr-4 border-none focus:ring-2 focus:ring-primary text-sm font-medium"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      {filteredModels.map((m) => (
                        <div
                          key={m}
                          onClick={() => {
                            setIsModelOther(false); setCustomModel(''); setModel(m)
                            setModelOpen(false)
                          }}
                          className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                            model === m && !isModelOther ? 'bg-primary/10' : 'bg-surface-container hover:bg-surface-container-high'
                          }`}
                        >
                          <span className={`text-base font-bold ${model === m && !isModelOther ? 'text-primary' : 'text-on-surface'}`}>
                            {m}
                          </span>
                          {model === m && !isModelOther && <Icon name="check" size="sm" className="text-primary" />}
                        </div>
                      ))}
                      {!modelSearch && (
                        <div
                          onClick={() => {
                            setIsModelOther(true); setModel('')
                            setModelOpen(false)
                          }}
                          className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                            isModelOther ? 'bg-primary/10' : 'bg-surface-container hover:bg-surface-container-high'
                          }`}
                        >
                          <span className={`text-base font-bold ${isModelOther ? 'text-primary' : 'text-on-surface'}`}>
                            Άλλο
                          </span>
                          {isModelOther && <Icon name="check" size="sm" className="text-primary" />}
                        </div>
                      )}
                      {filteredModels.length === 0 && modelSearch && (
                        <div className="p-2 space-y-2">
                          <p className="text-center text-xs text-on-surface-variant/50">Δεν βρέθηκε μοντέλο</p>
                          <div
                            onClick={() => {
                              setIsModelOther(true); setModel(''); setCustomModel(modelSearch)
                              setModelOpen(false); setModelSearch('')
                            }}
                            className="flex items-center gap-3 p-3 rounded-xl cursor-pointer bg-tertiary/10 hover:bg-tertiary/20 transition-colors"
                          >
                            <Icon name="add_circle" size="sm" className="text-tertiary" />
                            <span className="text-sm font-bold text-on-surface">
                              Συνέχεια με &ldquo;<span className="text-tertiary">{modelSearch}</span>&rdquo;
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="π.χ. Samara, ForTwo..."
                  className="w-full h-14 bg-surface-container-highest rounded-xl px-4 border-none focus:ring-2 focus:ring-primary font-bold text-base"
                />
              )}
            </div>
          )}

          {/* Custom Model (when brand is from list but model is "other") */}
          {isModelOther && !isBrandOther && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                Μοντέλο (Άλλο) <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="Εισάγετε μοντέλο..."
                className="w-full h-14 bg-surface-container-highest rounded-xl px-4 border-none focus:ring-2 focus:ring-primary font-bold text-sm"
              />
            </div>
          )}

          {/* Model Year */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              Ετος Μοντελου
            </label>
            <div className="relative">
              <input
                type="text"
                value={modelYear}
                onChange={handleModelYearChange}
                placeholder="2020"
                className="w-full h-14 bg-surface-container-highest border-0 rounded-xl px-4 pr-12 font-medium text-on-surface focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-all"
                maxLength={4}
              />
              <Icon name="calendar_month" className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size="md" />
            </div>
            {modelYear && modelYear.length === 4 && isYearValid(modelYear) && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <Icon name="check_circle" size="sm" className="text-green-600" /> Εγκυρο
              </p>
            )}
            {modelYear && modelYear.length === 4 && !isYearValid(modelYear) && (
              <p className="text-xs text-error flex items-center gap-1">
                <Icon name="error" size="sm" className="text-error" /> Το έτος δεν μπορεί να είναι μελλοντικό
              </p>
            )}
            {modelYear && modelYear.length > 0 && modelYear.length < 4 && (
              <p className="text-xs text-tertiary">
                4 ψηφια απαιτουνται
              </p>
            )}
          </div>

          {/* Engine CC — hidden for bodywork */}
          {!isBodywork && (
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              Κυβισμος (CC)
            </label>
            <div className="relative">
              <input
                type="text"
                value={engineCC}
                onChange={handleEngineCCChange}
                placeholder="1600"
                className="w-full h-14 bg-surface-container-highest border-0 rounded-xl px-4 pr-12 font-medium text-on-surface focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-all"
                maxLength={4}
              />
              <Icon name="speed" className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size="md" />
            </div>
            {engineCC && isCCValid(engineCC) && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <Icon name="check_circle" size="sm" className="text-green-600" /> Εγκυρο
              </p>
            )}
            {engineCC && engineCC.length > 0 && !isCCValid(engineCC) && (
              <p className="text-xs text-tertiary">
                100-9999
              </p>
            )}
          </div>
          )}

          {/* Fuel Type - 2 button grid — hidden for bodywork */}
          {!isBodywork && (
          <>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              Καυσιμο
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFuelType('petrol')}
                className={
                  fuelType === 'petrol'
                    ? 'h-12 rounded-xl font-bold text-xs bg-primary text-on-primary shadow-md shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all'
                    : 'h-12 rounded-xl font-bold text-xs bg-surface-container text-secondary hover:bg-surface-variant flex items-center justify-center gap-2 active:scale-95 transition-all'
                }
              >
                <Icon name="local_gas_station" size="sm" />
                Βενζινη
              </button>
              <button
                type="button"
                onClick={() => setFuelType('diesel')}
                className={
                  fuelType === 'diesel'
                    ? 'h-12 rounded-xl font-bold text-xs bg-primary text-on-primary shadow-md shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all'
                    : 'h-12 rounded-xl font-bold text-xs bg-surface-container text-secondary hover:bg-surface-variant flex items-center justify-center gap-2 active:scale-95 transition-all'
                }
              >
                <Icon name="oil_barrel" size="sm" />
                Πετρελαιο
              </button>
            </div>
          </div>

          {/* Transmission - 2 button grid */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              Κιβωτιο
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsAutomatic(false)}
                className={
                  !isAutomatic
                    ? 'h-12 rounded-xl font-bold text-xs bg-primary text-on-primary shadow-md shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all'
                    : 'h-12 rounded-xl font-bold text-xs bg-surface-container text-secondary hover:bg-surface-variant flex items-center justify-center gap-2 active:scale-95 transition-all'
                }
              >
                <Icon name="sports_esports" size="sm" />
                Χειροκινητο
              </button>
              <button
                type="button"
                onClick={() => setIsAutomatic(true)}
                className={
                  isAutomatic
                    ? 'h-12 rounded-xl font-bold text-xs bg-primary text-on-primary shadow-md shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all'
                    : 'h-12 rounded-xl font-bold text-xs bg-surface-container text-secondary hover:bg-surface-variant flex items-center justify-center gap-2 active:scale-95 transition-all'
                }
              >
                <Icon name="auto_transmission" size="sm" />
                Αυτοματο
              </button>
            </div>
          </div>

          {/* Drive + Turbo side by side as pill toggles */}
          <div className="grid grid-cols-2 gap-4">
            {/* 4x4 Drive */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                Κινηση
              </label>
              <div className="flex bg-surface-container p-1 rounded-full">
                <button
                  type="button"
                  onClick={() => setIs4x4(false)}
                  className={
                    !is4x4
                      ? 'flex-1 py-2 rounded-full font-bold text-[10px] bg-primary text-on-primary shadow-sm text-center'
                      : 'flex-1 py-2 rounded-full font-bold text-[10px] text-secondary text-center'
                  }
                >
                  2WD
                </button>
                <button
                  type="button"
                  onClick={() => setIs4x4(true)}
                  className={
                    is4x4
                      ? 'flex-1 py-2 rounded-full font-bold text-[10px] bg-primary text-on-primary shadow-sm text-center'
                      : 'flex-1 py-2 rounded-full font-bold text-[10px] text-secondary text-center'
                  }
                >
                  4x4
                </button>
              </div>
            </div>

            {/* Turbo */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                Turbo
              </label>
              <div className="flex bg-surface-container p-1 rounded-full">
                <button
                  type="button"
                  onClick={() => setIsTurbo(false)}
                  className={
                    !isTurbo
                      ? 'flex-1 py-2 rounded-full font-bold text-[10px] bg-primary text-on-primary shadow-sm text-center'
                      : 'flex-1 py-2 rounded-full font-bold text-[10px] text-secondary text-center'
                  }
                >
                  Οχι
                </button>
                <button
                  type="button"
                  onClick={() => setIsTurbo(true)}
                  className={
                    isTurbo
                      ? 'flex-1 py-2 rounded-full font-bold text-[10px] bg-primary text-on-primary shadow-sm text-center'
                      : 'flex-1 py-2 rounded-full font-bold text-[10px] text-secondary text-center'
                  }
                >
                  Ναι
                </button>
              </div>
            </div>
          </div>
          </>
          )}
        </div>
      </div>

      {/* CTA Button */}
      <GearSubmitButton onClick={handleSubmit} disabled={!isFormValid || isSubmitting} isLoading={isSubmitting} className="mt-6" />

      {/* Back button */}
      <div className="mt-4 text-center space-y-2">
        <button
          onClick={() => router.back()}
          className="text-primary hover:text-primary-container font-bold text-sm transition-colors duration-200 flex items-center gap-1 mx-auto"
        >
          <Icon name="arrow_back" size="sm" />
          Επιστροφη
        </button>
        <div>
          <button
            onClick={() => {
              if (confirm('Θελετε να διαγραψετε ολα τα στοιχεια της φορμας;')) {
                clearFormData()
                window.location.href = '/'
              }
            }}
            className="text-secondary hover:text-on-surface text-xs transition-colors duration-200"
          >
            Διαγραφη ολων των στοιχειων
          </button>
        </div>
      </div>
    </div>
  )
}
