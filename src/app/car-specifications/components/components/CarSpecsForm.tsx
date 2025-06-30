'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowRight, HiCloudArrowUp, HiPhoto, HiInformationCircle } from 'react-icons/hi2'
import { styles } from '../../../../styles/styles'
import { saveFormData, loadFormData } from '../../../../utils/formStorage'

interface CarSpecsFormProps {
  savedData: {
    category: string
    description: string
    brand: string
    model: string
    modelYear: string
    vinNumber: string
    engineCC: string
  }
}

export default function CarSpecsForm({ savedData }: CarSpecsFormProps) {
  const router = useRouter()
  const [vinNumber, setVinNumber] = useState('')
  const [fuelType, setFuelType] = useState<'petrol' | 'diesel' | ''>('petrol')
  const [isAutomatic, setIsAutomatic] = useState(false)
  const [is4x4, setIs4x4] = useState(false)
  const [engineNumber, setEngineNumber] = useState('')
  const [hasLicensePhoto, setHasLicensePhoto] = useState(false)
  const [licensePhoto, setLicensePhoto] = useState<File | null>(null)
  const [mounted, setMounted] = useState(false)
  const [showVinInfo, setShowVinInfo] = useState(false)
  const [showEngineInfo, setShowEngineInfo] = useState(false)

  // Load saved data on component mount
  useEffect(() => {
    setMounted(true)
    const data = loadFormData()
    if (data.vinNumber) setVinNumber(data.vinNumber)
    if (data.fuelType) setFuelType(data.fuelType)
    else setFuelType('petrol')
    if (data.isAutomatic !== undefined) setIsAutomatic(data.isAutomatic)
    if (data.is4x4 !== undefined) setIs4x4(data.is4x4)
    if (data.engineNumber) setEngineNumber(data.engineNumber)
  }, [])

  // Save data whenever it changes
  useEffect(() => {
    if (mounted) {
      saveFormData({
        vinNumber,
        fuelType,
        isAutomatic,
        is4x4,
        engineNumber
      })
    }
  }, [vinNumber, fuelType, isAutomatic, is4x4, engineNumber, mounted])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLicensePhoto(file)
      // For now, just store file info since File objects can't be serialized to localStorage
      // In a real app, you'd upload to a server or convert to base64
    }
  }

  const isFormValid = 
    vinNumber.trim() !== '' &&
    fuelType !== '' && 
    (engineNumber.trim() !== '' || licensePhoto !== null)

  const handleSubmit = () => {
    if (isFormValid) {
      // Save final data
      saveFormData({
        vinNumber,
        fuelType,
        isAutomatic,
        is4x4,
        engineNumber
      })
      
      console.log('Submitting car specifications:', {
        ...savedData,
        vinNumber,
        fuelType,
        isAutomatic,
        is4x4,
        engineNumber,
        licensePhoto: licensePhoto?.name || null
      })
      
      // For now, show success message
      const fuelText = fuelType === 'petrol' ? 'Βενζίνη' : 'Πετρέλαιο'
      const transmissionText = isAutomatic ? 'Αυτόματο' : 'Χειροκίνητο'
      const driveText = is4x4 ? '4x4' : '2WD'
      alert(`Ολοκληρώθηκε! ${savedData.brand} ${savedData.model} (${savedData.modelYear}), ${savedData.engineCC}cc, ${fuelText}, ${transmissionText}, ${driveText}`)
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
            Τεχνικά <span className={styles.titleHighlight}>Στοιχεία</span>
          </h1>
          <p className={`mt-3 max-w-md mx-auto ${styles.bodyText} sm:text-lg md:mt-5 md:text-xl md:max-w-3xl`}>
            Παρακαλώ συμπληρώστε τα προχωρημένα τεχνικά στοιχεία του αυτοκινήτου σας
          </p>
          
          {/* Show selected car details */}
          <div className={`${styles.cardSimple} mt-8 max-w-md mx-auto`}>
            <h3 className={`${styles.cardTitle} mb-2`}>Επιλεγμένο Όχημα:</h3>
            <p className={styles.smallText}>{savedData.brand} {savedData.model} ({savedData.modelYear})</p>
            <p className={styles.smallText}>Κυβισμός: {savedData.engineCC}cc</p>
            <p className={styles.smallText}>Κατηγορία: {savedData.category}</p>
          </div>
          
          <div className="mt-8 max-w-md mx-auto">
            <div className={styles.card}>
              {/* Fuel Type Switch */}
              <div className={styles.fieldGroup}>
                <label className={styles.label}>
                  Τύπος Καυσίμου:
                </label>
                <div className={styles.toggleContainer}>
                  <button
                    type="button"
                    onClick={() => setFuelType('petrol')}
                    className={fuelType === 'petrol' ? styles.toggleBtnActive : styles.toggleBtnInactive}
                  >
                    Βενζίνη
                  </button>
                  <button
                    type="button"
                    onClick={() => setFuelType('diesel')}
                    className={fuelType === 'diesel' ? styles.toggleBtnActive : styles.toggleBtnInactive}
                  >
                    Πετρέλαιο
                  </button>
                </div>
              </div>

              {/* Automatic Transmission */}
              <div className={styles.fieldGroup}>
                <div className={styles.switchContainer}>
                  <label className={styles.label}>
                    Αυτόματο Κιβώτιο:
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAutomatic(!isAutomatic)}
                    className={isAutomatic ? styles.switchActive : styles.switchInactive}
                  >
                    <span
                      className={isAutomatic ? styles.switchThumbActive : styles.switchThumbInactive}
                    />
                  </button>
                </div>
                <p className={styles.switchDescription}>
                  {isAutomatic ? 'Αυτόματο κιβώτιο ταχυτήτων' : 'Χειροκίνητο κιβώτιο ταχυτήτων'}
                </p>
              </div>

              {/* 4x4 Drive */}
              <div className={styles.fieldGroup}>
                <div className={styles.switchContainer}>
                  <label className={styles.label}>
                    Τετρακίνηση (4x4):
                  </label>
                  <button
                    type="button"
                    onClick={() => setIs4x4(!is4x4)}
                    className={is4x4 ? styles.switchActive : styles.switchInactive}
                  >
                    <span
                      className={is4x4 ? styles.switchThumbActive : styles.switchThumbInactive}
                    />
                  </button>
                </div>
                <p className={styles.switchDescription}>
                  {is4x4 ? 'Όχημα με τετρακίνηση' : 'Όχημα με δικίνηση'}
                </p>
              </div>

              {/* Engine Number or License Photo */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabelWithIcon}>
                  <label className={styles.label}>
                    Αριθμός Κινητήρα ή Φωτογραφία Άδειας:
                  </label>
                  <div className="relative">
                    <HiInformationCircle 
                      className={styles.infoIcon}
                      onMouseEnter={() => setShowEngineInfo(true)}
                      onMouseLeave={() => setShowEngineInfo(false)}
                    />
                    {showEngineInfo && (
                      <div className={styles.tooltip}>
                        <div className="text-left">
                          <p className={styles.tooltipTitle}>Πού να βρείτε τον αριθμό κινητήρα:</p>
                          <img 
                            src="/images/engine-number-location.jpg" 
                            alt="Θέση αριθμού κινητήρα"
                            className={styles.tooltipImage}
                            onError={(e) => {
                              e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NzM4NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkVuZ2luZSBOdW1iZXIgTG9jYXRpb248L3RleHQ+PC9zdmc+'
                            }}
                          />
                          <p className={styles.tooltipText}>
                            Συνήθως βρίσκεται στο μπλοκ του κινητήρα ή στην άδεια κυκλοφορίας
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className={styles.fieldContainer}>
                  {/* Toggle between text input and photo upload */}
                  <div className={styles.toggleContainer}>
                    <button
                      type="button"
                      onClick={() => setHasLicensePhoto(false)}
                      className={!hasLicensePhoto ? styles.toggleBtnActive : styles.toggleBtnInactive}
                    >
                      Αριθμός Κινητήρα
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasLicensePhoto(true)}
                      className={hasLicensePhoto ? styles.toggleBtnActive : styles.toggleBtnInactive}
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
                    <div className={styles.fileUploadArea}>
                      <input
                        type="file"
                        id="license-photo"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <label htmlFor="license-photo" className="cursor-pointer">
                        {licensePhoto ? (
                          <div className={styles.fileUploadSelected}>
                            <HiPhoto className={styles.fileUploadIcon} />
                            <p className={styles.fileUploadText}>{licensePhoto.name}</p>
                            <p className={styles.fileUploadSubtext}>Κάντε κλικ για αλλαγή</p>
                          </div>
                        ) : (
                          <div className={styles.fileUploadPlaceholder}>
                            <HiCloudArrowUp className={styles.fileUploadIcon} />
                            <p className={styles.fileUploadText}>Κάντε κλικ για ανέβασμα</p>
                            <p className={styles.fileUploadSubtext}>JPG, PNG μέχρι 10MB</p>
                          </div>
                        )}
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* VIN Number - Now last field */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabelWithIcon}>
                  <label className={styles.label}>
                    Αριθμός Πλαισίου (VIN):
                  </label>
                  <div className="relative">
                    <HiInformationCircle 
                      className={styles.infoIcon}
                      onMouseEnter={() => setShowVinInfo(true)}
                      onMouseLeave={() => setShowVinInfo(false)}
                    />
                    {showVinInfo && (
                      <div className={styles.tooltip}>
                        <div className="text-left">
                          <p className={styles.tooltipTitle}>Πού να βρείτε τον αριθμό πλαισίου:</p>
                          <img 
                            src="/images/vin-number-location.jpg" 
                            alt="Θέση αριθμού πλαισίου VIN"
                            className={styles.tooltipImage}
                            onError={(e) => {
                              e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NzM4NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPldJTiBOdW1iZXIgTG9jYXRpb248L3RleHQ+PC9zdmc+'
                            }}
                          />
                          <p className={styles.tooltipText}>
                            Βρίσκεται στο ντασμπόρτ (κάτω από το παρμπρίζ), στο πλαίσιο της πόρτας οδηγού, ή στην άδεια κυκλοφορίας
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  value={vinNumber}
                  onChange={(e) => setVinNumber(e.target.value.toUpperCase())}
                  placeholder="π.χ. WVWZZZ1JZ3W386752"
                  className={styles.input}
                  maxLength={17}
                />
                {vinNumber && vinNumber.length > 0 && (
                  <p className={styles.switchDescription}>
                    Μήκος: {vinNumber.length}/17 χαρακτήρες
                  </p>
                )}
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
                className={`inline-block ${styles.linkText} font-medium transition-colors duration-200`}
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