import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowRight } from 'react-icons/hi2'
import { styles } from '../../../../styles/styles'
import { saveFormData, loadFormData, clearFormData } from '../../../../utils/formStorage'
import SegmentedControl from '../../../../components/SegmentedControl'

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
  const [engineCC, setEngineCC] = useState('')
  const [modelYear, setModelYear] = useState('')
  const [fuelType, setFuelType] = useState<'petrol' | 'diesel' | ''>('petrol')
  const [isAutomatic, setIsAutomatic] = useState(false)
  const [is4x4, setIs4x4] = useState(false)
  const [isTurbo, setIsTurbo] = useState(false)
  const [mounted, setMounted] = useState(false)

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
    
    // Restore technical specifications
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
        engineCC,
        modelYear,
        fuelType,
        isAutomatic,
        is4x4,
        isTurbo
      })
    }
  }, [engineCC, modelYear, fuelType, isAutomatic, is4x4, isTurbo, mounted])

  // Form validation - check if we have valid CC, year, and fuel type
  const isFormValid = 
    isCCValid(engineCC) &&
    modelYear.length === 4 && /^\d{4}$/.test(modelYear) &&
    fuelType !== ''

  const handleSubmit = () => {
    if (isFormValid) {
      // Save technical specifications before navigation
      saveFormData({
        engineCC,
        modelYear,
        fuelType,
        isAutomatic,
        is4x4,
        isTurbo
      })
      
      // Navigate to the next step (car specifications or body work photos)
      router.push('/car-specifications')
    }
  }

  return (
    <div className="mt-5 max-w-lg mx-auto md:mt-8">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
        {/* Form Fields */}
        <div className="space-y-4">
          {/* Model Year, Engine CC, and Fuel Type - Three in a row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Model Year */}
            <div className="space-y-2">
              <label className={styles.label}>
                Έτος:
              </label>
              <input
                type="text"
                value={modelYear}
                onChange={handleModelYearChange}
                placeholder="2020"
                className={styles.input}
                maxLength={4}
              />
              {modelYear && modelYear.length === 4 && (
                <p className="text-xs text-gray-500 mt-1">
                  ✓ Έγκυρο
                </p>
              )}
              {modelYear && modelYear.length > 0 && modelYear.length < 4 && (
                <p className="text-xs text-red-500 mt-1">
                  4 ψηφία
                </p>
              )}
            </div>

            {/* Engine CC */}
            <div className="space-y-2">
              <label className={styles.label}>
                CC:
              </label>
              <input
                type="text"
                value={engineCC}
                onChange={handleEngineCCChange}
                placeholder="1600"
                className={styles.input}
                maxLength={4}
              />
              {engineCC && isCCValid(engineCC) && (
                <p className="text-xs text-gray-500 mt-1">
                  ✓ Έγκυρο
                </p>
              )}
              {engineCC && engineCC.length > 0 && !isCCValid(engineCC) && (
                <p className="text-xs text-red-500 mt-1">
                  100-9999
                </p>
              )}
            </div>

            {/* Fuel Type */}
            <div className="space-y-2">
              <label className={styles.label}>
                Καύσιμο:
              </label>
              <SegmentedControl
                options={[
                  { value: 'petrol', label: 'Βενζίνη' },
                  { value: 'diesel', label: 'Πετρέλαιο' }
                ]}
                value={fuelType}
                onChange={(value) => setFuelType(value as 'petrol' | 'diesel' | '')}
                variant="orange"
                size="md"
              />
            </div>
          </div>

          {/* Transmission and Drive Type - Side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Automatic Transmission */}
            <div className="space-y-2">
              <label className={styles.label}>
                Αυτόματο:
              </label>
              <SegmentedControl
                options={[
                  { value: 'manual', label: 'Χειροκίνητο' },
                  { value: 'automatic', label: 'Αυτόματο' }
                ]}
                value={isAutomatic ? 'automatic' : 'manual'}
                onChange={(value) => setIsAutomatic(value === 'automatic')}
                variant="orange"
                size="md"
              />
            </div>

            {/* 4x4 Drive */}
            <div className="space-y-2">
              <label className={styles.label}>
                4x4:
              </label>
              <SegmentedControl
                options={[
                  { value: '2wd', label: '2WD' },
                  { value: '4x4', label: '4x4' }
                ]}
                value={is4x4 ? '4x4' : '2wd'}
                onChange={(value) => setIs4x4(value === '4x4')}
                variant="orange"
                size="md"
              />
            </div>

            {/* Turbo */}
            <div className="space-y-2">
              <label className={styles.label}>
                Turbo:
              </label>
              <SegmentedControl
                options={[
                  { value: 'no', label: 'Όχι' },
                  { value: 'yes', label: 'Ναι' }
                ]}
                value={isTurbo ? 'yes' : 'no'}
                onChange={(value) => setIsTurbo(value === 'yes')}
                variant="orange"
                size="md"
              />
            </div>
          </div>
        </div>
        
        <button 
          onClick={handleSubmit}
          disabled={!isFormValid}
          className={`w-full mt-4 justify-center px-6 py-3 text-base ${
            isFormValid 
              ? styles.btnPrimary 
              : styles.btnDisabled
          }`}
        >
          <HiArrowRight className="h-5 w-5" />
          Συνέχεια
        </button>
      </div>
      
      <div className="mt-4 text-center space-y-2">
        <button
          onClick={() => router.back()}
          className={`inline-block ${styles.linkText} font-medium transition-colors duration-200`}
        >
          ← Επιστροφή
        </button>
        <div>
          <button
            onClick={() => {
              if (confirm('Θέλετε να διαγράψετε όλα τα στοιχεία της φόρμας;')) {
                clearFormData()
                window.location.href = '/'
              }
            }}
            className="text-gray-500 hover:text-gray-700 text-sm transition-colors duration-200"
          >
            Διαγραφή όλων των στοιχείων
          </button>
        </div>
      </div>
    </div>
  )
} 