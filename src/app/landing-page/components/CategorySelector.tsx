'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { saveFormData, loadFormData } from '../../../utils/formStorage'
import Icon from '@/components/ui/Icon'
import GearSubmitButton from '@/components/GearSubmitButton'

interface CategorySelectorProps {
  selectedCategory: string
  onCategorySelect: (category: string) => void
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

export default function CategorySelector({ selectedCategory, onCategorySelect }: CategorySelectorProps) {
  const [description, setDescription] = useState('')
  const [selectedBrand, setSelectedBrand] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [isBrandOther, setIsBrandOther] = useState(false)
  const [isModelOther, setIsModelOther] = useState(false)
  const [customBrand, setCustomBrand] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [mounted, setMounted] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    const savedData = loadFormData()
    if (savedData.category) onCategorySelect(savedData.category)
    if (savedData.description) setDescription(savedData.description)
    if (savedData.brand) {
      setSelectedBrand(savedData.brand)
      setIsBrandOther(savedData.isBrandOther)
      setCustomBrand(savedData.customBrand)
    }
    if (savedData.model) {
      setSelectedModel(savedData.model)
      setIsModelOther(savedData.isModelOther)
      setCustomModel(savedData.customModel)
    }
  }, [onCategorySelect])

  useEffect(() => {
    if (mounted) {
      saveFormData({
        category: selectedCategory, description, brand: selectedBrand, model: selectedModel,
        isBrandOther, isModelOther, customBrand, customModel
      })
    }
  }, [selectedCategory, description, selectedBrand, selectedModel, isBrandOther, isModelOther, customBrand, customModel, mounted])

  const handleBrandChange = (brand: string) => {
    if (brand === 'other') {
      setIsBrandOther(true)
      setSelectedBrand('')
    } else {
      setIsBrandOther(false)
      setCustomBrand('')
      setSelectedBrand(brand)
    }
    setIsModelOther(false)
    setCustomModel('')
    setSelectedModel('')
  }

  const handleCustomBrandChange = (value: string) => {
    setCustomBrand(value)
    setSelectedBrand(value)
  }

  const handleModelChange = (model: string) => {
    if (model === 'other') {
      setIsModelOther(true)
      setSelectedModel('')
    } else {
      setIsModelOther(false)
      setCustomModel('')
      setSelectedModel(model)
    }
  }

  const handleCustomModelChange = (value: string) => {
    setCustomModel(value)
    setSelectedModel(value)
  }

  const currentBrand = isBrandOther ? customBrand : selectedBrand
  const currentModel = isModelOther ? customModel : selectedModel
  const isFormValid =
    selectedCategory.trim() !== '' &&
    description.trim() !== '' &&
    currentBrand.trim() !== '' &&
    currentModel.trim() !== ''

  const availableModels = !isBrandOther && selectedBrand ? carBrands[selectedBrand as keyof typeof carBrands] || [] : []

  const handleSubmit = () => {
    if (isFormValid) {
      const finalBrand = isBrandOther ? customBrand : selectedBrand
      const finalModel = isModelOther ? customModel : selectedModel
      saveFormData({
        category: selectedCategory, description, brand: finalBrand, model: finalModel,
        isBrandOther, isModelOther, customBrand, customModel
      })
      router.push('/car-details')
    }
  }

  return (
    <div id="create-request" className="scroll-mt-20 bg-surface-container-low rounded-2xl p-6 shadow-sm border border-outline-variant/10">
      <div className="mb-8">
        <h3 className="text-2xl font-black italic tracking-tighter mb-1">Δημιουργία Αιτήματος</h3>
        <p className="text-on-surface-variant/70 text-sm">Βήμα 1 από 3: Λεπτομέρειες Οχήματος</p>
      </div>

      <div className="space-y-5">
        {/* Category */}
        <div className="relative group">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2 ml-1">Κατηγορία <span className="text-error">*</span></label>
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => onCategorySelect(e.target.value)}
              className="w-full h-14 bg-surface-container-highest rounded-xl px-4 border-none focus:ring-2 focus:ring-primary appearance-none font-bold text-sm"
            >
              <option value="">Επιλέξτε...</option>
              <option value="service">Service</option>
              <option value="kteo">ΚΤΕΟ</option>
              <option value="elastika">Ελαστικά</option>
              <option value="fanopeia">Φανοποιεία</option>
              <option value="oils">Λάδια</option>
              <option value="disk">Δίσκος</option>
            </select>
            <Icon name="expand_more" className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant" />
          </div>
        </div>

        {/* Brand & Model */}
        <div className="grid grid-cols-2 gap-4">
          <div className="relative group">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2 ml-1">Μάρκα <span className="text-error">*</span></label>
            <div className="relative">
              <select
                value={isBrandOther ? 'other' : selectedBrand}
                onChange={(e) => handleBrandChange(e.target.value)}
                className="w-full h-14 bg-surface-container-highest rounded-xl px-4 border-none focus:ring-2 focus:ring-primary appearance-none font-bold text-sm"
              >
                <option value="">Επιλέξτε...</option>
                {Object.keys(carBrands).map((brand) => (
                  <option key={brand} value={brand}>
                    {brand.charAt(0).toUpperCase() + brand.slice(1)}
                  </option>
                ))}
                <option value="other">Άλλο</option>
              </select>
              <Icon name="expand_more" className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant" />
            </div>
          </div>

          {selectedBrand && !isBrandOther && (
            <div className="relative group">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2 ml-1">Μοντέλο <span className="text-error">*</span></label>
              <div className="relative">
                <select
                  value={isModelOther ? 'other' : selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="w-full h-14 bg-surface-container-highest rounded-xl px-4 border-none focus:ring-2 focus:ring-primary appearance-none font-bold text-sm"
                >
                  <option value="">Επιλέξτε...</option>
                  {availableModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                  <option value="other">Άλλο</option>
                </select>
                <Icon name="expand_more" className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant" />
              </div>
            </div>
          )}
        </div>

        {/* Custom Brand Input */}
        {isBrandOther && (
          <div className="relative group">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2 ml-1">Μάρκα <span className="text-error">*</span></label>
            <input
              type="text"
              value={customBrand}
              onChange={(e) => handleCustomBrandChange(e.target.value)}
              placeholder="π.χ. Lada, Smart, Proton..."
              className="w-full h-14 bg-surface-container-highest rounded-xl px-4 border-none focus:ring-2 focus:ring-primary font-bold text-sm"
            />
          </div>
        )}

        {/* Custom Model Input */}
        {(isModelOther || (isBrandOther && customBrand.trim() !== '')) && (
          <div className="relative group">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2 ml-1">Μοντέλο <span className="text-error">*</span></label>
            <input
              type="text"
              value={customModel}
              onChange={(e) => handleCustomModelChange(e.target.value)}
              placeholder="π.χ. Samara, ForTwo, Wira..."
              className="w-full h-14 bg-surface-container-highest rounded-xl px-4 border-none focus:ring-2 focus:ring-primary font-bold text-sm"
            />
          </div>
        )}

        {/* Description */}
        <div className="relative group">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2 ml-1">Περιγραφή Προβλήματος <span className="text-error">*</span></label>
          <textarea
            className="w-full bg-surface-container-highest rounded-xl px-4 py-3 border-none focus:ring-2 focus:ring-primary font-medium text-sm resize-none placeholder:text-on-surface-variant/30"
            rows={3}
            placeholder="Περιγράψτε τι χρειάζεται το αυτοκίνητό σας..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Submit */}
        <div className="pt-4">
          <GearSubmitButton onClick={handleSubmit} disabled={!isFormValid} />
        </div>

        {/* Professional Link */}
        <div className="mt-6 text-center">
          <a
            href="/register-professional"
            className="inline-flex items-center gap-2 text-primary font-bold tracking-widest text-[10px] uppercase group"
          >
            ΓΙΝΕ ΕΠΑΓΓΕΛΜΑΤΙΑΣ
            <Icon name="arrow_forward" size="sm" />
          </a>
        </div>
      </div>
    </div>
  )
}
