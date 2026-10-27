import { useState, useEffect, useRef, useCallback } from 'react'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import GearSubmitButton from '@/components/GearSubmitButton'
import PillToggle from '@/components/PillToggle'
import {
  saveFormData,
  loadFormData,
  clearFormData,
  claimFormData,
  DETACHED_VEHICLE,
  guestOwner,
  type ServiceFormData,
} from '../../../../utils/formStorage'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigation } from '@/hooks/useNavigation'

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

/**
 * The brand list is keyed in lowercase ('toyota', 'alfa romeo') and people type their own
 * in lowercase too, but this is the name every later screen shows back to them — and the
 * one that ends up on the vehicle record — so it gets capitalised here, at the source.
 * Already-uppercase words ("BMW") are left alone.
 */
const titleCase = (s: string) =>
  s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1))

// Bodywork categories don't need engine/fuel/transmission details
const BODYWORK_CATEGORIES = new Set(['oliki-vafi', 'meriki-vafi', 'fanopeia'])

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
  licensePhotoUrl?: string | null
}

/** What the form shows for one car, whichever way it arrived. */
interface VehicleFields {
  brand: string
  model: string
  isBrandOther: boolean
  isModelOther: boolean
  customBrand: string
  customModel: string
  modelYear: string
  engineCC: string
  fuelType: string
  isAutomatic: boolean
  is4x4: boolean
  isTurbo: boolean
}

/**
 * Maps a car — a saved vehicle, the draft in form storage, or the profile's "Νέο
 * Αίτημα" prefill — onto the form's controls. Brands and models are matched against
 * the picker lists; anything not in them becomes the "Άλλο" free text, so a saved
 * "Lada Niva" still shows up instead of an empty picker.
 */
function resolveVehicleFields(v: Partial<ServiceFormData & Vehicle>): VehicleFields {
  const typedBrand = ((v.isBrandOther ? v.customBrand || v.brand : v.brand) || '').trim()
  const typedModel = ((v.isModelOther || v.isBrandOther ? v.customModel || v.model : v.model) || '').trim()
  const brandKey = v.isBrandOther ? undefined : Object.keys(carBrands).find((b) => b === typedBrand.toLowerCase())

  let brandFields: Pick<VehicleFields, 'brand' | 'model' | 'isBrandOther' | 'isModelOther' | 'customBrand' | 'customModel'>
  if (brandKey) {
    const models: string[] = carBrands[brandKey as keyof typeof carBrands]
    const listed = v.isModelOther ? undefined : models.find((m) => m.toLowerCase() === typedModel.toLowerCase())
    brandFields = listed
      ? { brand: brandKey, model: listed, isBrandOther: false, isModelOther: false, customBrand: '', customModel: '' }
      : { brand: brandKey, model: '', isBrandOther: false, isModelOther: !!typedModel, customBrand: '', customModel: typedModel }
  } else if (typedBrand) {
    brandFields = { brand: '', model: '', isBrandOther: true, isModelOther: v.isModelOther ?? true, customBrand: typedBrand, customModel: typedModel }
  } else {
    brandFields = { brand: '', model: '', isBrandOther: false, isModelOther: false, customBrand: '', customModel: '' }
  }

  return {
    ...brandFields,
    modelYear: v.modelYear ? String(v.modelYear) : '',
    engineCC: v.engineCC ? String(v.engineCC) : '',
    // Kept as stored: a saved "hybrid" must not turn into "petrol" (and so into a
    // different car on the server) just because the pill only has two options.
    fuelType: v.fuelType || 'petrol',
    isAutomatic: v.isAutomatic === true,
    is4x4: v.is4x4 === true,
    isTurbo: v.isTurbo === true,
  }
}

export default function CarBrandModelSelector({ category }: { category: string }) {
  const { navigate, back, isNavigating } = useNavigation()
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [isBrandOther, setIsBrandOther] = useState(false)
  const [isModelOther, setIsModelOther] = useState(false)
  const [customBrand, setCustomBrand] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [description, setDescription] = useState('')
  const [engineCC, setEngineCC] = useState('')
  const [modelYear, setModelYear] = useState('')
  const [fuelType, setFuelType] = useState('petrol')
  const [isAutomatic, setIsAutomatic] = useState(false)
  const [is4x4, setIs4x4] = useState(false)
  const [isTurbo, setIsTurbo] = useState(false)
  const { client, garage, isVerified } = useAuth()
  const [mounted, setMounted] = useState(false)

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
  const currentBrand = titleCase(isBrandOther ? customBrand : brand)
  // Models picked from the list already read as they should ("Yaris", "e-tron GT"); only
  // the free-text one needs fixing up.
  const currentModel = (isModelOther || isBrandOther) ? titleCase(customModel) : model

  const applyFields = useCallback((f: VehicleFields) => {
    setBrand(f.brand); setModel(f.model)
    setIsBrandOther(f.isBrandOther); setIsModelOther(f.isModelOther)
    setCustomBrand(f.customBrand); setCustomModel(f.customModel)
    setModelYear(f.modelYear); setEngineCC(f.engineCC); setFuelType(f.fuelType)
    setIsAutomatic(f.isAutomatic); setIs4x4(f.is4x4); setIsTurbo(f.isTurbo)
  }, [])

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

  // Digits only, in a sane range. parseInt read a restored "1600cc" as 1600, so the
  // step passed and the API refused the request at the very end.
  const isCCValid = (cc: string) => /^\d+$/.test(cc) && Number(cc) >= 100 && Number(cc) <= 9999


  // Track form funnel
  useEffect(() => {
    const clientId = typeof window !== 'undefined' ? localStorage.getItem('clientId') : null
    fetch('/api/track/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'car_details_started', clientId, metadata: { category } }),
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Restore the draft. This used to wipe every vehicle field on mount, which emptied
  // step 1 on "Επιστροφή" from step 2 and threw away the car the profile's "Νέο
  // Αίτημα" had just prefilled. Starting clean is now the job of the entry points
  // (startNewRequest) and of a successful submit, not of this screen.
  useEffect(() => {
    const data = loadFormData()
    if (data.description) setDescription(data.description)
    applyFields(resolveVehicleFields(data))
    if (data.originalVehicleId) setSelectedVehicleId(data.originalVehicleId)
    setMounted(true)
  }, [applyFields])

  // Whose draft this is can only be settled once the server has said who we are. One
  // left by someone else keeps the job but not their car's link, numbers or άδεια.
  const owner = isVerified ? client?.id ?? garage?.id ?? guestOwner() : null
  useEffect(() => {
    if (!mounted || !owner) return
    if (claimFormData(owner)) setSelectedVehicleId('')
  }, [mounted, owner])

  // Pre-fill the garage picker with the client's own vehicles. Keyed on the
  // server-confirmed session rather than a localStorage id, so a stale id left
  // by a previous user can't put their cars in front of this one.
  useEffect(() => {
    if (!isVerified || !client) return
    let cancelled = false
    fetch(`/api/clients/${client.id}/vehicles/`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.success && data.vehicles?.length > 0) {
          setVehicles(data.vehicles.filter((v: Vehicle) => v.brand && v.model))
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isVerified, client])

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

  // A different brand or model is a different car, even one started from a saved car:
  // its link, numbers and άδεια stay with the saved one. Left attached, step 2 showed
  // the old car's άδεια as this one's, and the submit counted it as given. Not while
  // the model is still being picked — choosing a brand empties it for a moment.
  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId)
  useEffect(() => {
    if (!selectedVehicle || !currentBrand.trim() || !currentModel.trim()) return
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
    if (same(selectedVehicle.brand, currentBrand) && same(selectedVehicle.model, currentModel)) return
    setSelectedVehicleId('')
    saveFormData(DETACHED_VEHICLE)
  }, [selectedVehicle, currentBrand, currentModel])

  // Fill form from a saved vehicle
  const selectVehicle = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId)
    if (!vehicleId) {
      // "Νέο Όχημα" — a different car, so nothing of the one picked before may ride
      // along to step 2. Its VIN, engine number and saved-vehicle link used to, and
      // the new car was filed under the old car's numbers.
      applyFields(resolveVehicleFields({}))
      saveFormData(DETACHED_VEHICLE)
      return
    }
    const v = vehicles.find(v => v.id === vehicleId)
    if (!v) return

    applyFields(resolveVehicleFields(v))

    // Save vehicle data for the next step (car-specifications). The server compares
    // against the stored car itself; the id is all it needs from us.
    saveFormData({
      vinNumber: v.vinNumber || '',
      engineNumber: v.engineNumber || '',
      originalVehicleId: v.id,
      originalVehicleLicensePhotoUrl: v.licensePhotoUrl || '',
      originalVehicleData: undefined,
    })
  }

  const isBodywork = BODYWORK_CATEGORIES.has(category)

  // Form validation
  const isFormValid =
    currentBrand.trim() !== '' &&
    currentModel.trim() !== '' &&
    isYearValid(modelYear) &&
    (isBodywork || (isCCValid(engineCC) && fuelType !== ''))

  const handleSubmit = () => {
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
    fetch('/api/track/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: 'car_details_completed',
        clientId,
        metadata: { brand: currentBrand, model: currentModel, isBrandOther, isModelOther, category },
      }),
    }).catch(() => {})

    // Every category continues to step 2. Bodywork used to submit from here, with no
    // email or password for a guest — the API stored the request, then refused it.
    // Step 2 is where photos, the price estimate and the account all live.
    navigate('/car-specifications/')
  }

  const clearAll = () => {
    if (confirm('Θέλετε να διαγράψετε όλα τα στοιχεία της φόρμας;')) {
      clearFormData()
      navigate('/')
    }
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

            {isBodywork && (
              <p className="text-xs text-on-surface-variant flex items-center gap-1">
                <Icon name="photo_camera" size="sm" className="text-primary" />
                Τις φωτογραφίες της ζημιάς θα τις ανεβάσεις στο επόμενο βήμα.
              </p>
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
                    {titleCase(v.brand)} {v.model} {v.modelYear ? `(${v.modelYear})` : ''}
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
                  {isBrandOther ? 'Άλλο' : brand ? titleCase(brand) : 'Επιλέξτε...'}
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
                        {titleCase(b)}
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
              Έτος Μοντέλου <span className="text-error">*</span>
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
                <Icon name="check_circle" size="sm" className="text-green-600" /> Έγκυρο
              </p>
            )}
            {modelYear && modelYear.length === 4 && !isYearValid(modelYear) && (
              <p className="text-xs text-error flex items-center gap-1">
                <Icon name="error" size="sm" className="text-error" /> Το έτος δεν μπορεί να είναι μελλοντικό
              </p>
            )}
            {modelYear && modelYear.length > 0 && modelYear.length < 4 && (
              <p className="text-xs text-tertiary">
                Απαιτούνται 4 ψηφία
              </p>
            )}
          </div>

          {/* Engine CC — hidden for bodywork */}
          {!isBodywork && (
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              Κυβισμός (CC) <span className="text-error">*</span>
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
                <Icon name="check_circle" size="sm" className="text-green-600" /> Έγκυρο
              </p>
            )}
            {engineCC && engineCC.length > 0 && !isCCValid(engineCC) && (
              <p className="text-xs text-tertiary">
                100-9999
              </p>
            )}
          </div>
          )}

          {/* Fuel + transmission, then drive + turbo — same PillToggle the client's
              vehicle-edit modal uses. Hidden for bodywork, where the engine is irrelevant. */}
          {!isBodywork && (
          <>
          <div className="grid grid-cols-2 gap-4">
            <PillToggle
              label="Καύσιμο"
              options={[{ value: 'petrol', label: 'Βενζίνη' }, { value: 'diesel', label: 'Πετρέλαιο' }]}
              value={fuelType === 'diesel' ? 'diesel' : 'petrol'}
              onChange={(value) => setFuelType(value)}
            />
            <PillToggle
              label="Κιβώτιο"
              options={[{ value: false, label: 'Χειροκίνητο' }, { value: true, label: 'Αυτόματο' }]}
              value={isAutomatic}
              onChange={setIsAutomatic}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <PillToggle
              label="Κίνηση"
              options={[{ value: false, label: '2WD' }, { value: true, label: '4x4' }]}
              value={is4x4}
              onChange={setIs4x4}
            />
            <PillToggle
              label="Turbo"
              options={[{ value: false, label: 'Όχι' }, { value: true, label: 'Ναι' }]}
              value={isTurbo}
              onChange={setIsTurbo}
            />
          </div>
          </>
          )}
        </div>
      </div>

      {/* CTA Button */}
      <GearSubmitButton
        onClick={handleSubmit}
        disabled={!isFormValid}
        isLoading={isNavigating('/car-specifications/')}
        loadingLabel="Φόρτωση..."
        className="mt-6"
      />

      {/* Back button */}
      <div className="mt-4 text-center space-y-2">
        <button
          onClick={back}
          disabled={isNavigating('__back__')}
          className="text-primary hover:text-primary-container font-bold text-sm transition-colors duration-200 flex items-center gap-1 mx-auto disabled:opacity-60"
        >
          {isNavigating('__back__') ? <Spinner size="sm" /> : <Icon name="arrow_back" size="sm" />}
          Επιστροφή
        </button>
        <div>
          <button
            onClick={clearAll}
            disabled={isNavigating('/')}
            className="text-secondary hover:text-on-surface text-xs transition-colors duration-200 inline-flex items-center gap-1 disabled:opacity-60"
          >
            {isNavigating('/') && <Spinner size="sm" />}
            Διαγραφή όλων των στοιχείων
          </button>
        </div>
      </div>
    </div>
  )
}
