import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowRight } from 'react-icons/hi2'
import { styles } from '../../../../styles/styles'
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
  const [isBrandOther, setIsBrandOther] = useState(false)
  const [isModelOther, setIsModelOther] = useState(false)
  const [customBrand, setCustomBrand] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [mounted, setMounted] = useState(false)

  // Load saved data on component mount
  useEffect(() => {
    setMounted(true)
    const data = loadFormData()
    
    // Restore car selection state
    if (data.brand) {
      onBrandChange(data.brand)
      setIsBrandOther(data.isBrandOther)
      setCustomBrand(data.customBrand)
    }
    if (data.model) {
      onModelChange(data.model)
      setIsModelOther(data.isModelOther)
      setCustomModel(data.customModel)
    }
  }, [onBrandChange, onModelChange])

  // Save data whenever it changes
  useEffect(() => {
    if (mounted) {
      saveFormData({
        brand: selectedBrand,
        model: selectedModel,
        isBrandOther,
        isModelOther,
        customBrand,
        customModel
      })
    }
  }, [selectedBrand, selectedModel, isBrandOther, isModelOther, customBrand, customModel, mounted])

  // Form validation - check if we have both brand and model (either from dropdown or custom input)
  const currentBrand = isBrandOther ? customBrand : selectedBrand
  const currentModel = isModelOther ? customModel : selectedModel
  const isFormValid = currentBrand.trim() !== '' && currentModel.trim() !== ''
  const availableModels = !isBrandOther && selectedBrand ? carBrands[selectedBrand as keyof typeof carBrands] || [] : []

  const handleBrandChange = (brand: string) => {
    if (brand === 'other') {
      setIsBrandOther(true)
      onBrandChange('') // Clear parent brand while user types
    } else {
      setIsBrandOther(false)
      setCustomBrand('') // Clear custom brand
      onBrandChange(brand)
    }
    // Always reset model when brand changes
    setIsModelOther(false)
    setCustomModel('')
    onModelChange('')
  }

  const handleCustomBrandChange = (value: string) => {
    setCustomBrand(value)
    onBrandChange(value) // Update parent state with custom brand
  }

  const handleModelChange = (model: string) => {
    if (model === 'other') {
      setIsModelOther(true)
      onModelChange('') // Clear parent model while user types
    } else {
      setIsModelOther(false)
      setCustomModel('') // Clear custom model
      onModelChange(model)
    }
  }

  const handleCustomModelChange = (value: string) => {
    setCustomModel(value)
    onModelChange(value) // Update parent state with custom model
  }

  const handleSubmit = () => {
    if (isFormValid) {
      // Use the correct brand and model (either from dropdown or custom input)
      const finalBrand = isBrandOther ? customBrand : selectedBrand
      const finalModel = isModelOther ? customModel : selectedModel
      
      // Save final car details before navigation
      saveFormData({
        brand: finalBrand,
        model: finalModel,
        isBrandOther,
        isModelOther,
        customBrand,
        customModel
      })
      
      // Navigate to the next step (car specifications or body work photos)
      router.push('/car-specifications')
    }
  }

  return (
    <div className="mt-5 max-w-md mx-auto md:mt-8">
      <div className={styles.card}>
        {/* Brand Selection */}
        <div className="mb-4">
          <label className={`${styles.label} text-lg text-center`}>
            Επιλέξτε μάρκα:
          </label>
          <select 
            value={isBrandOther ? 'other' : selectedBrand}
            onChange={(e) => handleBrandChange(e.target.value)}
            className={styles.select}
          >
            <option value="">Επιλέξτε μάρκα...</option>
            {Object.keys(carBrands).map((brand) => (
              <option key={brand} value={brand}>
                {brand.charAt(0).toUpperCase() + brand.slice(1)}
              </option>
            ))}
            <option value="other">Άλλο</option>
          </select>
        </div>

        {/* Custom Brand Input - Show if "Άλλο" is selected */}
        {isBrandOther && (
          <div className="mb-4">
            <label className={styles.label}>
              Εισάγετε μάρκα:
            </label>
            <input
              type="text"
              value={customBrand}
              onChange={(e) => handleCustomBrandChange(e.target.value)}
              placeholder="π.χ. Lada, Smart, Proton..."
              className={styles.input}
            />
          </div>
        )}

        {/* Model Selection - Only show if brand is selected and not custom */}
        {selectedBrand && !isBrandOther && (
          <div className="mb-4">
            <label className={styles.label}>
              Επιλέξτε μοντέλο:
            </label>
            <select 
              value={isModelOther ? 'other' : selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className={styles.select}
            >
              <option value="">Επιλέξτε μοντέλο...</option>
              {availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
              <option value="other">Άλλο</option>
            </select>
          </div>
        )}

        {/* Custom Model Input - Show if model "Άλλο" is selected OR brand is custom */}
        {(isModelOther || (isBrandOther && customBrand.trim() !== '')) && (
          <div className="mb-4">
            <label className={styles.label}>
              Εισάγετε μοντέλο:
            </label>
            <input
              type="text"
              value={customModel}
              onChange={(e) => handleCustomModelChange(e.target.value)}
              placeholder="π.χ. Samara, ForTwo, Wira..."
              className={styles.input}
            />
          </div>
        )}
        
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