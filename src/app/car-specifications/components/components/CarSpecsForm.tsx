'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import GearSubmitButton from '@/components/GearSubmitButton'
import LoginModal from '@/components/LoginModal'
import { saveFormData, loadFormData } from '../../../../utils/formStorage'
import { useToast } from '../../../../hooks/useToast'
import { useAuth } from '@/contexts/AuthContext'
import Image from 'next/image'

interface CarSpecsFormProps {
  savedData: {
    category: string
    description: string
    brand: string
    model: string
    isBrandOther: boolean
    isModelOther: boolean
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
  const { refreshClient } = useAuth()
  const [vinNumber, setVinNumber] = useState('')
  const [engineNumber, setEngineNumber] = useState('')
  const [email, setEmail] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [hasLicensePhoto, setHasLicensePhoto] = useState(false)
  const [licensePhoto, setLicensePhoto] = useState<File | null>(null)
  const [mounted, setMounted] = useState(false)
  const [showVinInfo, setShowVinInfo] = useState(false)
  const [showEngineInfo, setShowEngineInfo] = useState(false)
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null)
  const [isEstimatingPrice, setIsEstimatingPrice] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [emailExists, setEmailExists] = useState(false)
  const [emailCheckName, setEmailCheckName] = useState('')
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)

  // Track form funnel
  useEffect(() => {
    const clientId = localStorage.getItem('clientId')
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'car_specs_started', clientId }),
    }).catch(() => {})
  }, [])

  // Load saved data on component mount
  useEffect(() => {
    setMounted(true)
    setIsLoggedIn(!!localStorage.getItem('clientId'))
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

  const isEmailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
  const isPasswordValid = password.length >= 6 && password === confirmPassword

  // Debounced email check
  const checkEmail = useCallback(async (emailToCheck: string) => {
    if (!isEmailValid(emailToCheck)) return
    setIsCheckingEmail(true)
    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToCheck, userType: 'client' })
      })
      const data = await res.json()
      setEmailExists(data.exists)
      setEmailCheckName(data.firstName || '')
    } catch {
      setEmailExists(false)
    } finally {
      setIsCheckingEmail(false)
    }
  }, [])

  useEffect(() => {
    if (!mounted || isLoggedIn || !isEmailValid(email)) {
      setEmailExists(false)
      return
    }
    const timer = setTimeout(() => checkEmail(email), 800)
    return () => clearTimeout(timer)
  }, [email, mounted, isLoggedIn, checkEmail])

  const isFormValid =
    vinNumber.trim() !== '' &&
    (engineNumber.trim() !== '' || licensePhoto !== null) &&
    (isLoggedIn || (isEmailValid(email) && !emailExists && isPasswordValid && acceptedTerms))

  const handleSubmit = async () => {
    if (isFormValid) {
      setIsSubmitting(true)

      // Save final data
      saveFormData({
        vinNumber,
        engineNumber
      })

      // Get client ID from localStorage if user is logged in
      const loggedInClientId = localStorage.getItem('clientId')

      // Load latest form data to include originalVehicleId and originalVehicleData
      const latestFormData = loadFormData()

      const serviceRequest = {
        ...savedData,
        vinNumber,
        engineNumber,
        licensePhoto: licensePhoto?.name || null,
        // Include original vehicle tracking data if present
        ...(latestFormData.originalVehicleId && { originalVehicleId: latestFormData.originalVehicleId }),
        ...(latestFormData.originalVehicleData && { originalVehicleData: latestFormData.originalVehicleData }),
        // Include client ID if user is logged in
        ...(loggedInClientId && { clientId: loggedInClientId }),
        // Include email and password for new users + the consent flag
        ...(!loggedInClientId && email && { email, password, acceptedTerms: true })
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
          error('Λείπουν στοιχεία', result.error || 'Σφάλμα κατά την αποστολή')
          return
        }

        if (result.success) {
          const fuelText = savedData.fuelType === 'petrol' ? 'Βενζινη' : 'Πετρελαιο'
          const transmissionText = savedData.isAutomatic ? 'Αυτοματο' : 'Χειροκινητο'
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
            'Επιτυχια!',
            `${savedData.brand} ${savedData.model} (${savedData.modelYear}), ${savedData.engineCC}cc, ${fuelText}, ${transmissionText}, ${driveText}\n\nΣταλθηκε ειδοποιηση σε ${result.notificationsSent} συνεργεια μεσω SMS!\n\nΑνακατευθυνση στη σελιδα αιτηματων...`
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
          error('Σφαλμα', result.error || 'Αγνωστο σφαλμα')
        }
      } catch (err) {
        console.error('Error submitting service request:', err)
        error('Σφαλμα', 'Σφαλμα κατα την αποστολη. Παρακαλω δοκιμαστε ξανα.')
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const handleGoBack = () => {
    router.back()
  }

  return (
    <section className="pb-4 pt-8">
      <div className="max-w-lg mx-auto px-5">
        {/* Step progress indicator - 4 bars */}
        <div className="flex gap-2 mb-6">
          <div className="flex-1 h-1 rounded-full bg-primary-container" />
          <div className="flex-1 h-1 rounded-full bg-primary-container" />
          <div className="flex-1 h-1 rounded-full bg-surface-container-highest" />
          <div className="flex-1 h-1 rounded-full bg-surface-container-highest" />
        </div>

        {/* Page title */}
        <h1 className="text-[2rem] font-black tracking-[-0.02em] text-on-surface">
          Τεχνικα Στοιχεια
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant leading-relaxed">
          Συμπληρωστε τα προχωρημενα τεχνικα στοιχεια του οχηματος σας
        </p>

        {/* Selected Vehicle summary card */}
        <div className="mt-6 bg-surface-container-lowest rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon name="directions_car" className="text-primary" size="md" />
            </div>
            <div className="min-w-0">
              <p className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                ΕΠΙΛΕΓΜΕΝΟ ΟΧΗΜΑ
              </p>
              <p className="text-sm font-bold text-on-surface">
                {savedData.brand} {savedData.model} ({savedData.modelYear})
              </p>
              <p className="text-xs text-on-surface-variant">
                {savedData.engineCC}cc &middot; {savedData.category}
              </p>
              {savedData.description && (
                <p className="text-xs text-on-surface-variant mt-1 italic">
                  {savedData.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Estimated cost card */}
        {(estimatedPrice || isEstimatingPrice) && (
          <div className="mt-3 bg-primary/5 rounded-2xl border border-primary/10 p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon name="payments" className="text-primary" size="md" />
              </div>
              <div className="flex-1">
                <p className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                  Εκτιμωμενο Κοστος
                </p>
                {isEstimatingPrice ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <p className="text-sm text-primary font-medium">Υπολογισμος...</p>
                  </div>
                ) : (
                  <p className="text-xl font-black text-primary">{estimatedPrice}EUR</p>
                )}
              </div>
            </div>
            <p className="text-xs font-semibold text-tertiary mt-3 ml-[52px]">
              Ενδεικτική εκτίμηση — συμπληρώστε τα στοιχεία σας για να λάβετε πραγματικές προσφορές από συνεργεία
            </p>
          </div>
        )}

        {/* Main form card */}
        <div className="mt-6 space-y-6">

          {/* Email & Password for guest users */}
          {mounted && !isLoggedIn && (
            <div className="space-y-5">
              {/* Email */}
              <div className="space-y-3">
                <label className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                  Email <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="π.χ. example@email.com"
                    className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 pr-12 font-medium text-on-surface focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  <Icon name={isCheckingEmail ? 'progress_activity' : 'mail'} className={`absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 ${isCheckingEmail ? 'animate-spin' : ''}`} size="md" />
                </div>
                {email && !isEmailValid(email) && (
                  <p className="text-xs text-error flex items-center gap-1">
                    <Icon name="error" size="sm" className="text-error" /> Μη έγκυρη διεύθυνση email
                  </p>
                )}
                {emailExists && (
                  <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-3">
                    <p className="text-sm text-on-surface">
                      Αυτό το email χρησιμοποιείται ήδη. Συνδεθείτε για να συνεχίσετε.
                    </p>
                    <button
                      onClick={() => setShowLoginModal(true)}
                      className="w-full h-10 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                    >
                      <Icon name="login" size="sm" />
                      Σύνδεση
                    </button>
                  </div>
                )}
              </div>

              {/* Password fields - only if email is valid and doesn't exist */}
              {isEmailValid(email) && !emailExists && (
                <>
                  <div className="space-y-3">
                    <label className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                      Κωδικός πρόσβασης <span className="text-error">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Τουλάχιστον 6 χαρακτήρες"
                        className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 pr-12 font-medium text-on-surface focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                      <Icon name="lock" className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size="md" />
                    </div>
                    {password && password.length < 6 && (
                      <p className="text-xs text-error flex items-center gap-1">
                        <Icon name="error" size="sm" className="text-error" /> Τουλάχιστον 6 χαρακτήρες
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <label className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                      Επιβεβαίωση κωδικού <span className="text-error">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Επαναλάβετε τον κωδικό"
                        className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 pr-12 font-medium text-on-surface focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                      <Icon name="lock" className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size="md" />
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-xs text-error flex items-center gap-1">
                        <Icon name="error" size="sm" className="text-error" /> Οι κωδικοί δεν ταιριάζουν
                      </p>
                    )}
                    {confirmPassword && password === confirmPassword && password.length >= 6 && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <Icon name="check_circle" size="sm" className="text-green-600" /> Θα δημιουργηθεί ο λογαριασμός σας κατά την υποβολή
                      </p>
                    )}
                  </div>

                  {/* Consent — required for GDPR */}
                  <label className="flex items-start gap-2 cursor-pointer select-none pt-2">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      required
                      className="mt-0.5 h-4 w-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                    />
                    <span className="text-xs text-on-surface-variant leading-snug">
                      Έχω διαβάσει και αποδέχομαι τους{' '}
                      <a href="/terms" target="_blank" rel="noreferrer" className="text-primary underline">
                        Όρους Χρήσης
                      </a>
                      {' '}και την{' '}
                      <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline">
                        Πολιτική Απορρήτου
                      </a>
                      .
                    </span>
                  </label>
                </>
              )}
            </div>
          )}

          {/* Engine Number or License Photo */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                Κινητηρας η Αδεια
              </label>
              <div className="relative">
                <Icon
                  name="info"
                  size="sm"
                  className="text-primary cursor-help"
                  onClick={() => setShowEngineInfo(!showEngineInfo)}
                />
                {showEngineInfo && (
                  <div className="absolute top-6 left-0 z-50 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-lg p-4 w-64">
                    <div className="text-left">
                      <p className="text-sm font-bold text-on-surface mb-2">Που να βρειτε τον αριθμο κινητηρα:</p>
                      <Image
                        src="/images/engine-number-location.jpg"
                        alt="Θεση αριθμου κινητηρα"
                        width={300}
                        height={200}
                        className="w-full h-32 object-cover rounded-lg mb-2"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NzM4NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkVuZ2luZSBOdW1iZXIgTG9jYXRpb248L3RleHQ+PC9zdmc+'
                        }}
                      />
                      <p className="text-xs text-secondary">
                        Συνηθως βρισκεται στο μπλοκ του κινητηρα η στην αδεια κυκλοφοριας
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Toggle between text input and photo upload */}
            <div className="bg-surface-container-high p-1.5 rounded-full flex gap-1">
              <button
                type="button"
                onClick={() => setHasLicensePhoto(false)}
                className={
                  !hasLicensePhoto
                    ? 'flex-1 py-2.5 rounded-full font-bold text-xs bg-primary-container text-white shadow-lg text-center transition-all'
                    : 'flex-1 py-2.5 rounded-full font-bold text-xs text-on-surface-variant hover:bg-surface-variant text-center transition-all'
                }
              >
                Αριθμος
              </button>
              <button
                type="button"
                onClick={() => setHasLicensePhoto(true)}
                className={
                  hasLicensePhoto
                    ? 'flex-1 py-2.5 rounded-full font-bold text-xs bg-primary-container text-white shadow-lg text-center transition-all'
                    : 'flex-1 py-2.5 rounded-full font-bold text-xs text-on-surface-variant hover:bg-surface-variant text-center transition-all'
                }
              >
                Φωτο
              </button>
            </div>

            {!hasLicensePhoto ? (
              <>
                <input
                  type="text"
                  value={engineNumber}
                  onChange={(e) => setEngineNumber(e.target.value)}
                  placeholder="π.χ. ABC123456"
                  className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 font-medium text-on-surface focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </>
            ) : (
              <>
                <div className="bg-tertiary/10 border border-tertiary/20 rounded-xl p-3 flex items-start gap-2">
                  <Icon name="info" size="sm" className="text-tertiary mt-0.5 shrink-0" />
                  <p className="text-xs text-on-surface-variant">
                    Ανεβάστε μια <span className="font-bold text-on-surface">καθαρή και ευανάγνωστη</span> φωτογραφία της άδειας κυκλοφορίας. Θα αντλήσουμε αυτόματα τα στοιχεία του οχήματος (αρ. κινητήρα, πλαισίου).
                  </p>
                </div>
                <div className="border-2 border-dashed border-outline-variant/30 rounded-2xl p-8 text-center hover:border-primary transition-colors">
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
                        <Icon name="photo" size="lg" className="mx-auto mb-2" />
                        <p className="text-sm font-bold">{licensePhoto.name}</p>
                        <p className="text-xs text-on-surface-variant">Κανε κλικ για αλλαγη</p>
                      </div>
                    ) : (
                      <div className="text-on-surface-variant">
                        <Icon name="cloud_upload" size="lg" className="mx-auto mb-2" />
                        <p className="text-sm font-bold">Κανε κλικ για ανεβασμα</p>
                        <p className="text-xs text-on-surface-variant">JPG, PNG μεχρι 10MB</p>
                      </div>
                    )}
                  </label>
                </div>
              </>
            )}
          </div>

          {/* VIN Number — only when NOT uploading license photo */}
          {!hasLicensePhoto && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                VIN (Αριθμος Πλαισιου)
              </label>
              <div className="relative">
                <Icon
                  name="info"
                  size="sm"
                  className="text-primary cursor-help"
                  onClick={() => setShowVinInfo(!showVinInfo)}
                />
                {showVinInfo && (
                  <div className="absolute top-6 left-0 z-50 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-lg p-4 w-64">
                    <div className="text-left">
                      <p className="text-sm font-bold text-on-surface mb-2">Που να βρειτε τον αριθμο πλαισιου:</p>
                      <Image
                        src="/images/vin-number-location.jpg"
                        alt="Θεση αριθμου πλαισιου VIN"
                        width={300}
                        height={200}
                        className="w-full h-32 object-cover rounded-lg mb-2"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NzM4NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPldJTiBOdW1iZXIgTG9jYXRpb248L3RleHQ+PC9zdmc+'
                        }}
                      />
                      <p className="text-xs text-secondary">
                        Βρισκεται στο ντασμπορντ (κατω απο το παρμπριζ), στο πλαισιο της πορτας οδηγου, η στην αδεια κυκλοφοριας
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="relative">
              <input
                type="text"
                value={vinNumber}
                onChange={(e) => setVinNumber(e.target.value.toUpperCase())}
                placeholder="π.χ. WVWZZZ1JZ3W386752"
                className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 pr-12 font-medium text-on-surface focus:ring-2 focus:ring-primary/20 transition-all"
                maxLength={17}
              />
              <Icon name="pin" className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size="md" />
            </div>
            {vinNumber && vinNumber.length > 0 && (
              <p className="text-xs text-on-surface-variant">
                {vinNumber.length}/17 χαρακτηρες
              </p>
            )}
          </div>
          )}
        </div>

        {/* Submit section */}
        <div className="mt-8">
          <GearSubmitButton
            onClick={handleSubmit}
            disabled={!isFormValid}
            isLoading={isSubmitting}
          />

          {/* Back link */}
          <div className="mt-3 text-center">
            <button
              onClick={handleGoBack}
              className="text-primary hover:text-primary-container font-bold text-sm transition-colors duration-200"
            >
              Επιστροφη
            </button>
          </div>
        </div>
      </div>

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        email={email}
        firstName={emailCheckName}
        onLoginSuccess={(clientId) => {
          setIsLoggedIn(true)
          localStorage.removeItem('garageId')
          localStorage.setItem('clientId', clientId)
          // Sync the global AuthContext so the header (and any other
          // consumer of useAuth) immediately reflects the logged-in state.
          // Without this the header keeps showing "Σύνδεση" until reload.
          void refreshClient(clientId)
        }}
      />
    </section>
  )
}
