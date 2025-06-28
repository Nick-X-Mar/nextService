'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowRight, HiCloudArrowUp, HiPhoto } from 'react-icons/hi2'
import { styles } from '../../../../styles/styles'
import { saveFormData, loadFormData } from '../../../../utils/formStorage'

interface CarSpecsFormProps {
  savedData: {
    category: string
    description: string
    brand: string
    model: string
  }
}

export default function CarSpecsForm({ savedData }: CarSpecsFormProps) {
  const router = useRouter()
  const [modelYear, setModelYear] = useState('')
  const [engineCC, setEngineCC] = useState('')
  const [engineNumber, setEngineNumber] = useState('')
  const [hasLicensePhoto, setHasLicensePhoto] = useState(false)
  const [licensePhoto, setLicensePhoto] = useState<File | null>(null)
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
    if (data.modelYear) setModelYear(data.modelYear)
    if (data.engineCC) setEngineCC(data.engineCC)
    if (data.engineNumber) setEngineNumber(data.engineNumber)
  }, [])

  // Save data whenever it changes
  useEffect(() => {
    if (mounted) {
      saveFormData({
        modelYear,
        engineCC,
        engineNumber
      })
    }
  }, [modelYear, engineCC, engineNumber, mounted])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLicensePhoto(file)
      // For now, just store file info since File objects can't be serialized to localStorage
      // In a real app, you'd upload to a server or convert to base64
    }
  }

  const isFormValid = 
    modelYear.length === 4 && /^\d{4}$/.test(modelYear) && 
    isCCValid(engineCC) && 
    (engineNumber.trim() !== '' || licensePhoto !== null)

  const handleSubmit = () => {
    if (isFormValid) {
      // Save final data
      saveFormData({
        modelYear,
        engineCC,
        engineNumber
      })
      
      console.log('Submitting car specifications:', {
        ...savedData,
        modelYear,
        engineCC,
        engineNumber,
        licensePhoto: licensePhoto?.name || null
      })
      
      // For now, show success message
      alert(`Ολοκληρώθηκε! ${savedData.brand} ${savedData.model} (${modelYear}), ${engineCC}cc`)
    }
  }

  const handleGoBack = () => {
    router.back()
  }

  return (
    <section className="bg-white">
      <div className={`${styles.container} py-24`}>
        <div className="text-center">
          <h1 className={styles.pageTitle}>
            Τεχνικά <span className="text-blue-600">Στοιχεία</span>
          </h1>
          <p className={`mt-3 max-w-md mx-auto ${styles.bodyText} sm:text-lg md:mt-5 md:text-xl md:max-w-3xl`}>
            Παρακαλώ συμπληρώστε τα τεχνικά στοιχεία του αυτοκινήτου σας
          </p>
          
          {/* Show selected car details */}
          <div className={`${styles.cardSimple} mt-8 max-w-md mx-auto`}>
            <h3 className={`${styles.cardTitle} mb-2`}>Επιλεγμένο Όχημα:</h3>
            <p className={styles.smallText}>{savedData.brand} {savedData.model}</p>
            <p className={styles.smallText}>Κατηγορία: {savedData.category}</p>
          </div>
          
          <div className="mt-8 max-w-md mx-auto">
            <div className={styles.card}>
              {/* Model Year */}
              <div className="mb-4">
                <label className={styles.label}>
                  Έτος Κατασκευής:
                </label>
                <input
                  type="text"
                  value={modelYear}
                  onChange={handleModelYearChange}
                  placeholder="π.χ. 2020"
                  className={styles.input}
                  maxLength={4}
                />
                {modelYear && modelYear.length === 4 && (
                  <p className="text-xs text-gray-500 mt-1">
                    ✓ Έγκυρο έτος κατασκευής
                  </p>
                )}
                {modelYear && modelYear.length > 0 && modelYear.length < 4 && (
                  <p className="text-xs text-red-500 mt-1">
                    Παρακαλώ εισάγετε 4 ψηφία
                  </p>
                )}
              </div>

              {/* Engine CC */}
              <div className="mb-4">
                <label className={styles.label}>
                  Κυβικά Εκατοστά (CC):
                </label>
                <input
                  type="text"
                  value={engineCC}
                  onChange={handleEngineCCChange}
                  placeholder="π.χ. 1600, 2000, 2500"
                  className={styles.input}
                  maxLength={4}
                />
                {engineCC && isCCValid(engineCC) && (
                  <p className="text-xs text-gray-500 mt-1">
                    ✓ Έγκυρος κυβισμός κινητήρα
                  </p>
                )}
                {engineCC && engineCC.length > 0 && !isCCValid(engineCC) && (
                  <p className="text-xs text-red-500 mt-1">
                    Παρακαλώ εισάγετε έγκυρο κυβισμό (100-9999cc)
                  </p>
                )}
              </div>

              {/* Engine Number or License Photo */}
              <div className="mb-4">
                <label className={styles.label}>
                  Αριθμός Κινητήρα ή Φωτογραφία Άδειας:
                </label>
                
                <div className="space-y-3">
                  {/* Toggle between text input and photo upload */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setHasLicensePhoto(false)}
                      className={`px-3 py-1 rounded text-sm ${
                        !hasLicensePhoto ? styles.btnPrimary : styles.btnOutline
                      }`}
                    >
                      Αριθμός Κινητήρα
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasLicensePhoto(true)}
                      className={`px-3 py-1 rounded text-sm ${
                        hasLicensePhoto ? styles.btnPrimary : styles.btnOutline
                      }`}
                    >
                      Φωτογραφία Άδειας
                    </button>
                  </div>

                  {!hasLicensePhoto ? (
                    <input
                      type="text"
                      value={engineNumber}
                      onChange={(e) => setEngineNumber(e.target.value)}
                      placeholder="π.χ. ABC123456"
                      className={styles.input}
                    />
                  ) : (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                      <input
                        type="file"
                        id="license-photo"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <label htmlFor="license-photo" className="cursor-pointer">
                        {licensePhoto ? (
                          <div className="text-green-600">
                            <HiPhoto className="h-8 w-8 mx-auto mb-2" />
                            <p className="text-sm font-medium">{licensePhoto.name}</p>
                            <p className="text-xs text-gray-500">Κάντε κλικ για αλλαγή</p>
                          </div>
                        ) : (
                          <div className="text-gray-500">
                            <HiCloudArrowUp className="h-8 w-8 mx-auto mb-2" />
                            <p className="text-sm font-medium">Κάντε κλικ για ανέβασμα</p>
                            <p className="text-xs">JPG, PNG μέχρι 10MB</p>
                          </div>
                        )}
                      </label>
                    </div>
                  )}
                </div>
              </div>
              
              <button 
                onClick={handleSubmit}
                disabled={!isFormValid}
                className={`w-full mt-4 justify-center px-6 py-3 text-base ${
                  isFormValid ? styles.btnPrimary : styles.btnDisabled
                }`}
              >
                <HiArrowRight className="h-5 w-5" />
                Ζήτα προσφορές
              </button>
            </div>
            
            <div className="mt-4 text-center">
              <button
                onClick={handleGoBack}
                className="inline-block text-blue-600 hover:text-blue-700 font-medium transition-colors duration-200"
              >
                ← Επιστροφή
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
} 