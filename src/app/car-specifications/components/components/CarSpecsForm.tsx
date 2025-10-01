'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowRight, HiCloudArrowUp, HiPhoto, HiInformationCircle } from 'react-icons/hi2'
import { styles } from '../../../../styles/styles'
import { saveFormData, loadFormData } from '../../../../utils/formStorage'
import { useToast } from '../../../../hooks/useToast'
import Image from 'next/image'

interface CarSpecsFormProps {
  savedData: {
    category: string
    description: string
    brand: string
    model: string
    modelYear: string
    vinNumber: string
    engineCC: string
    fuelType: string
    isAutomatic: boolean
    is4x4: boolean
    estimatedPrice: number | null
  }
}

export default function CarSpecsForm({ savedData }: CarSpecsFormProps) {
  const router = useRouter()
  const { success, error } = useToast()
  const [vinNumber, setVinNumber] = useState('')
  const [engineNumber, setEngineNumber] = useState('')
  const [hasLicensePhoto, setHasLicensePhoto] = useState(false)
  const [licensePhoto, setLicensePhoto] = useState<File | null>(null)
  const [mounted, setMounted] = useState(false)
  const [showVinInfo, setShowVinInfo] = useState(false)
  const [showEngineInfo, setShowEngineInfo] = useState(false)
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null)
  const [isEstimatingPrice, setIsEstimatingPrice] = useState(false)

  // Load saved data on component mount
  useEffect(() => {
    setMounted(true)
    const data = loadFormData()
    if (data.vinNumber) setVinNumber(data.vinNumber)
    if (data.engineNumber) setEngineNumber(data.engineNumber)
    
    // Estimate price when component mounts if not already estimated
    if (!data.estimatedPrice && data.brand && data.model && data.modelYear && data.engineCC && data.fuelType) {
      estimatePrice(data)
    } else if (data.estimatedPrice) {
      setEstimatedPrice(data.estimatedPrice)
    }
  }, [])

  // Function to estimate price
  const estimatePrice = async (data: any) => {
    setIsEstimatingPrice(true)
    try {
      const response = await fetch('/api/price-estimation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: data.category,
          brand: data.brand,
          model: data.model,
          modelYear: data.modelYear,
          engineCC: data.engineCC,
          fuelType: data.fuelType,
          isAutomatic: data.isAutomatic,
          is4x4: data.is4x4
        })
      })

      const result = await response.json()
      
      if (result.success && result.estimation) {
        setEstimatedPrice(result.estimation.estimatedCost)
        // Save estimated price to form data
        saveFormData({
          estimatedPrice: result.estimation.estimatedCost
        })
      }
    } catch (error) {
      console.error('Price estimation error:', error)
    } finally {
      setIsEstimatingPrice(false)
    }
  }

  // Save data whenever it changes
  useEffect(() => {
    if (mounted) {
      saveFormData({
        vinNumber,
        engineNumber
      })
    }
  }, [vinNumber, engineNumber, mounted])

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
    (engineNumber.trim() !== '' || licensePhoto !== null)

  const handleSubmit = async () => {
    if (isFormValid) {
      // Save final data
      saveFormData({
        vinNumber,
        engineNumber
      })
      
      // Get client ID from localStorage if user is logged in
      const loggedInClientId = localStorage.getItem('clientId')
      
      const serviceRequest = {
        ...savedData,
        vinNumber,
        engineNumber,
        licensePhoto: licensePhoto?.name || null,
        // Include client ID if user is logged in
        ...(loggedInClientId && { clientId: loggedInClientId })
      }
      
      try {
        const response = await fetch('/api/service-request', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(serviceRequest),
        })

        const result = await response.json()
        
        if (!response.ok) {
          error('Σφάλμα', result.error || 'Σφάλμα κατά την αποστολή')
          return
        }
        
        if (result.success) {
          const fuelText = savedData.fuelType === 'petrol' ? 'Βενζίνη' : 'Πετρέλαιο'
          const transmissionText = savedData.isAutomatic ? 'Αυτόματο' : 'Χειροκίνητο'
          const driveText = savedData.is4x4 ? '4x4' : '2WD'
          
          // Store service request and vehicle data in localStorage for potential deduplication (only for guest users)
          if (!loggedInClientId) {
            const pendingRegistrationData = {
              serviceRequestId: result.serviceRequestId,
              vehicleData: {
                id: result.vehicleId,
                brand: savedData.brand,
                model: savedData.model,
                modelYear: savedData.modelYear,
                vinNumber: vinNumber,
                engineCC: savedData.engineCC,
                fuelType: savedData.fuelType,
                isAutomatic: savedData.isAutomatic,
                is4x4: savedData.is4x4,
                engineNumber: engineNumber
              },
              clientId: result.clientId,
              timestamp: Date.now()
            }
            
            localStorage.setItem('pendingRegistrationData', JSON.stringify(pendingRegistrationData))
          }
          
          success(
            'Επιτυχία!', 
            `${savedData.brand} ${savedData.model} (${savedData.modelYear}), ${savedData.engineCC}cc, ${fuelText}, ${transmissionText}, ${driveText}\n\n📱 Στάλθηκε ειδοποίηση σε ${result.notificationsSent} συνεργεία μέσω SMS!\n\nΑνακατεύθυνση στη σελίδα αιτημάτων...`
          )
          
          // Redirect to requests page with clientId
          if (result.clientId) {
            router.push(`/requests/${result.clientId}`)
          } else if (loggedInClientId) {
            // Fallback to logged in client ID
            router.push(`/requests/${loggedInClientId}`)
          } else {
            router.push('/requests')
          }
        } else {
          error('Σφάλμα', result.error || 'Άγνωστο σφάλμα')
        }
      } catch (err) {
        console.error('Error submitting service request:', err)
        error('Σφάλμα', 'Σφάλμα κατά την αποστολή. Παρακαλώ δοκιμάστε ξανά.')
      }
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

          {/* Show estimated cost */}
          {(estimatedPrice || isEstimatingPrice) && (
            <div className={`${styles.cardSimple} mt-4 max-w-md mx-auto bg-orange-50 border-orange-200`}>
              <h3 className={`${styles.cardTitle} mb-2 text-orange-800`}>Εκτιμώμενο Κόστος:</h3>
              {isEstimatingPrice ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-600"></div>
                  <p className="text-lg text-orange-600">Υπολογισμός...</p>
                </div>
              ) : (
                <p className="text-2xl font-bold text-orange-600">{estimatedPrice}€</p>
              )}
              <p className="text-xs text-orange-600 mt-1">
                Για να λάβετε πραγματικές προσφορές από συνεργεία, συμπληρώστε τα τεχνικά στοιχεία παρακάτω
              </p>
            </div>
          )}
          
          <div className="mt-8 max-w-md mx-auto">
            <div className={styles.card}>
              {/* Engine Number or License Photo */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabelWithIcon}>
                  <label className={styles.label}>
                    Κινητήρας ή Άδεια:
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
                          <Image 
                            src="/images/engine-number-location.jpg" 
                            alt="Θέση αριθμού κινητήρα"
                            width={300}
                            height={200}
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
                      Αριθμός
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasLicensePhoto(true)}
                      className={hasLicensePhoto ? styles.toggleBtnActive : styles.toggleBtnInactive}
                    >
                      Φωτό
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
                    VIN:
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
                          <Image 
                            src="/images/vin-number-location.jpg" 
                            alt="Θέση αριθμού πλαισίου VIN"
                            width={300}
                            height={200}
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
                  <p className="text-xs text-gray-500 mt-1">
                    {vinNumber.length}/17 χαρακτήρες
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
                Ζήτα προσφορές
                <HiArrowRight className="h-5 w-5" />
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