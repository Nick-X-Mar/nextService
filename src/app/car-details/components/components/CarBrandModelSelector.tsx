import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import GearSubmitButton from '@/components/GearSubmitButton'
import { saveFormData, loadFormData, clearFormData } from '../../../../utils/formStorage'

interface CarBrandModelSelectorProps {
  selectedBrand: string
  selectedModel: string
  onBrandChange: (brand: string) => void
  onModelChange: (model: string) => void
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

export default function CarBrandModelSelector({
  selectedBrand,
  selectedModel,
  onBrandChange,
  onModelChange
}: CarBrandModelSelectorProps) {
  const router = useRouter()
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

  const [brandOpen, setBrandOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const brandRef = useRef<HTMLDivElement>(null)
  const modelRef = useRef<HTMLDivElement>(null)

  const availableModels = !isBrandOther && brand ? carBrands[brand as keyof typeof carBrands] || [] : []
  const currentBrand = isBrandOther ? customBrand : brand
  const currentModel = isModelOther ? customModel : model

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (brandRef.current && !brandRef.current.contains(e.target as Node)) setBrandOpen(false)
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false)
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


  // Load saved data on component mount
  useEffect(() => {
    setMounted(true)
    const data = loadFormData()

    if (data.brand) {
      if (data.isBrandOther) { setIsBrandOther(true); setCustomBrand(data.brand) }
      else setBrand(data.brand)
    }
    if (data.model) {
      if (data.isModelOther) { setIsModelOther(true); setCustomModel(data.model) }
      else setModel(data.model)
    }
    if (data.category) setCategory(data.category)
    if (data.description) setDescription(data.description)
    if (data.engineCC) setEngineCC(data.engineCC)
    if (data.modelYear) setModelYear(data.modelYear)
    if (data.fuelType) setFuelType(data.fuelType)
    else setFuelType('petrol')
    if (data.isAutomatic !== undefined) setIsAutomatic(data.isAutomatic)
    if (data.is4x4 !== undefined) setIs4x4(data.is4x4)
    if (data.isTurbo !== undefined) setIsTurbo(data.isTurbo)
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

  // Form validation
  const isFormValid =
    currentBrand.trim() !== '' &&
    currentModel.trim() !== '' &&
    description.trim() !== '' &&
    isCCValid(engineCC) &&
    isYearValid(modelYear) &&
    fuelType !== ''

  const handleSubmit = () => {
    if (isFormValid) {
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
      router.push('/car-specifications')
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
              Περιγραφή Προβλήματος <span className="text-error">*</span>
            </label>
            <textarea
              className="w-full bg-surface-container-highest rounded-xl px-4 py-3 border-none focus:ring-2 focus:ring-primary font-medium text-sm resize-none"
              rows={3}
              placeholder="Περιγράψτε τι χρειάζεται το αυτοκίνητό σας..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            {/* Photo recommendation for painting categories */}
            {(category === 'oliki-vafi' || category === 'meriki-vafi' || category === 'fanopeia') && descriptionPhotos.length === 0 && (
              <div className="bg-tertiary/10 border border-tertiary/20 rounded-xl p-3 flex items-start gap-2">
                <Icon name="photo_camera" size="sm" className="text-tertiary mt-0.5 shrink-0" />
                <p className="text-xs text-on-surface-variant">
                  <span className="font-bold text-on-surface">Προτείνουμε</span> να ανεβάσετε φωτογραφίες της ζημιάς για πιο ακριβείς προσφορές από τα συνεργεία.
                </p>
              </div>
            )}

            {/* Photo upload area */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                  Φωτογραφίες (προαιρετικά)
                </label>
                <span className="text-[10px] text-on-surface-variant/50">{descriptionPhotos.length}/5</span>
              </div>

              {/* Photo previews */}
              {descriptionPhotos.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {descriptionPhotos.map((photo, index) => (
                    <div key={index} className="relative w-20 h-20 rounded-xl overflow-hidden group">
                      <img
                        src={URL.createObjectURL(photo)}
                        alt={`Φωτο ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setDescriptionPhotos(prev => prev.filter((_, i) => i !== index))}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Icon name="close" size="sm" className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {descriptionPhotos.length < 5 && (
                <label className="flex items-center gap-2 cursor-pointer text-primary hover:text-primary/80 transition-colors w-fit">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || [])
                      setDescriptionPhotos(prev => [...prev, ...files].slice(0, 5))
                      e.target.value = ''
                    }}
                  />
                  <Icon name="add_photo_alternate" size="sm" />
                  <span className="text-xs font-bold">Προσθήκη φωτογραφίας</span>
                </label>
              )}
            </div>
          </div>

          {/* Brand */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              Μάρκα <span className="text-error">*</span>
            </label>
            <div className="relative" ref={brandRef}>
              <div
                onClick={() => { setBrandOpen(!brandOpen); setModelOpen(false) }}
                className="w-full h-14 bg-surface-container-highest rounded-xl px-4 flex items-center justify-between cursor-pointer"
              >
                <span className={`font-bold text-base ${currentBrand ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>
                  {isBrandOther ? 'Άλλο' : brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Επιλέξτε...'}
                </span>
                <Icon name={brandOpen ? 'expand_less' : 'expand_more'} className="text-on-surface-variant" />
              </div>
              {brandOpen && (
                <div className="absolute z-50 left-0 right-0 top-[60px] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/10 max-h-[320px] overflow-y-auto p-2 space-y-1">
                  {Object.keys(carBrands).map((b) => (
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
                    onClick={() => { setModelOpen(!modelOpen); setBrandOpen(false) }}
                    className="w-full h-14 bg-surface-container-highest rounded-xl px-4 flex items-center justify-between cursor-pointer"
                  >
                    <span className={`font-bold text-base ${model ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>
                      {isModelOther ? 'Άλλο' : model || 'Επιλέξτε...'}
                    </span>
                    <Icon name={modelOpen ? 'expand_less' : 'expand_more'} className="text-on-surface-variant" />
                  </div>
                  {modelOpen && (
                    <div className="absolute z-50 left-0 right-0 top-[60px] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/10 max-h-[320px] overflow-y-auto p-2 space-y-1">
                      {availableModels.map((m) => (
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

          {/* Engine CC */}
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

          {/* Fuel Type - 2 button grid */}
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
        </div>
      </div>

      {/* CTA Button */}
      <GearSubmitButton onClick={handleSubmit} disabled={!isFormValid} className="mt-6" />

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
