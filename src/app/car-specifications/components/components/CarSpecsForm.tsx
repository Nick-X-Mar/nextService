'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import GearSubmitButton from '@/components/GearSubmitButton'
import { saveFormData, loadFormData, clearFormData, getSubmissionId } from '../../../../utils/formStorage'
import { useToast } from '../../../../hooks/useToast'
import { useNavigation } from '@/hooks/useNavigation'
import { usePriceEstimate } from '@/hooks/usePriceEstimate'
import { getCategoryText } from '@/utils/categoryLabels'
import { compressImage } from '@/utils/imageCompression'
import EstimatedCostCard from './EstimatedCostCard'
import LicenseSample from './LicenseSample'
import GuestAccountFields, { useGuestAccount } from './GuestAccount'
import { useFileDrop } from '@/hooks/useFileDrop'
import { track } from '@/lib/track'

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
    isTurbo: boolean
    estimatedPrice: number | null
  }
}

// What /api/vehicles/[id]/license-photo stores. Checked when the photo is picked,
// after re-encoding, so a file it would refuse never gets as far as the submit.
const UPLOADABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_LICENSE_BYTES = 10 * 1024 * 1024

/** The request exists but the άδεια didn't make it — the numbers are now required. */
interface CreatedRequest {
  clientId: string
  vehicleId: string
}

async function uploadLicensePhoto(vehicleId: string, file: File): Promise<boolean> {
  try {
    const body = new FormData()
    body.append('file', file)
    const response = await fetch(`/api/vehicles/${vehicleId}/license-photo/`, { method: 'POST', body })
    return response.ok
  } catch {
    return false
  }
}

export default function CarSpecsForm({ savedData }: CarSpecsFormProps) {
  const { navigate, back, isNavigating } = useNavigation()
  const { success, error } = useToast()
  const account = useGuestAccount()
  const [vinNumber, setVinNumber] = useState('')
  const [engineNumber, setEngineNumber] = useState('')
  // The photo is the path we want people on: one shot instead of two numbers copied off
  // the engine block. A returning visitor who already typed the numbers is switched back
  // to the manual tab on mount.
  const [hasLicensePhoto, setHasLicensePhoto] = useState(true)
  const [licensePhoto, setLicensePhoto] = useState<File | null>(null)
  const [licensePhotoError, setLicensePhotoError] = useState<string | null>(null)
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false)
  const [existingLicensePhotoUrl, setExistingLicensePhotoUrl] = useState<string>('')
  const [mounted, setMounted] = useState(false)
  const [showVinInfo, setShowVinInfo] = useState(false)
  const [showEngineInfo, setShowEngineInfo] = useState(false)
  // Stays true from the first click through the redirect: the button must not come
  // back to life while the requests page loads, or a second tap files a second request.
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [createdRequest, setCreatedRequest] = useState<CreatedRequest | null>(null)

  // Track form funnel
  useEffect(() => {
    track('car_specs_started')
  }, [])

  const { estimate, isLoading: isEstimatingPrice } = usePriceEstimate(savedData)

  // Load saved data on component mount
  useEffect(() => {
    setMounted(true)
    const data = loadFormData()
    if (data.vinNumber) setVinNumber(data.vinNumber)
    if (data.engineNumber) setEngineNumber(data.engineNumber)
    // Only a presigned URL is renderable. Drafts saved before the vehicles list was
    // presigned hold a raw S3 key, which next/image throws on.
    if (data.originalVehicleLicensePhotoUrl?.startsWith('https://')) {
      setExistingLicensePhotoUrl(data.originalVehicleLicensePhotoUrl)
      setHasLicensePhoto(true)
    } else if (data.vinNumber || data.engineNumber) {
      setHasLicensePhoto(false)
    }
  }, [])

  // Save data whenever it changes — but not once the request exists: the draft has
  // been cleared then, and writing to it again would seed the next request.
  useEffect(() => {
    if (mounted && !createdRequest) {
      saveFormData({
        vinNumber,
        engineNumber
      })
    }
  }, [vinNumber, engineNumber, mounted, createdRequest])

  const acceptLicensePhoto = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setLicensePhotoError(null)
    setIsPreparingPhoto(true)
    try {
      // Re-encoded to JPEG at pick time rather than at submit, so a photo the server
      // would refuse — an iPhone HEIC this browser can't decode, a 15MB original — is
      // caught while the customer can still pick another one or type the numbers.
      const prepared = await compressImage(file)
      if (!UPLOADABLE_TYPES.includes(prepared.type) || prepared.size > MAX_LICENSE_BYTES) {
        setLicensePhoto(null)
        setLicensePhotoError('Αυτή η φωτογραφία δεν μπορεί να σταλεί. Τράβηξε μια νέα ή συμπλήρωσε τον αριθμό πλαισίου και κινητήρα.')
        return
      }
      // Only the File lives in memory — it can't be serialised to localStorage. The
      // upload itself happens on submit, once the vehicle id exists to key it against.
      setLicensePhoto(prepared)
      setHasLicensePhoto(true)
    } finally {
      setIsPreparingPhoto(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void acceptLicensePhoto(Array.from(e.target.files || []))
    // Reset so re-picking the same file still fires onChange, and so the
    // camera can be reopened straight after a retake.
    e.target.value = ''
  }

  // The dashed box below looked like a drop target but had no drop handling at
  // all, so a dropped photo made the browser navigate to it and wiped the
  // half-filled form. The whole window is the target now.
  const { dragActive } = useFileDrop((files) => void acceptLicensePhoto(files), {
    accept: (file) => file.type.startsWith('image/'),
  })

  const hasPhoto = licensePhoto !== null || !!existingLicensePhotoUrl
  const numbersGiven = vinNumber.trim() !== '' && engineNumber.trim() !== ''

  const isFormValid = !isPreparingPhoto && (
    createdRequest
      // Recovery: a fresh photo, or both numbers. The failed one doesn't count.
      ? licensePhoto !== null || numbersGiven
      // The άδεια carries the πλαίσιο and the αρ. κινητήρα itself, so a photo is the
      // whole answer — asking for the numbers on top of it (while their fields are
      // hidden) left the submit button permanently disabled.
      : account.isReady && (hasPhoto || numbersGiven)
  )

  const release = () => {
    submittingRef.current = false
    setIsSubmitting(false)
  }

  const carSummary = `${savedData.brand} ${savedData.model} (${savedData.modelYear})`

  /** After a failed άδεια upload: retry the photo, or store the typed numbers. */
  const completeVehicleDetails = async ({ clientId, vehicleId }: CreatedRequest) => {
    let saved = licensePhoto ? await uploadLicensePhoto(vehicleId, licensePhoto) : false
    if (!saved && numbersGiven) {
      try {
        const response = await fetch(`/api/vehicles/${vehicleId}/`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vinNumber, engineNumber }),
        })
        saved = response.ok
        if (!saved) {
          const result = await response.json().catch(() => ({}))
          error('Δεν αποθηκεύτηκαν', result.error || 'Δοκιμάστε ξανά.')
          release()
          return
        }
      } catch {
        saved = false
      }
    }
    if (!saved) {
      error('Δεν αποθηκεύτηκαν', 'Συμπληρώστε τον αριθμό πλαισίου και κινητήρα και δοκιμάστε ξανά.')
      setLicensePhoto(null)
      setHasLicensePhoto(false)
      release()
      return
    }
    success('Ολοκληρώθηκε', 'Τα στοιχεία του οχήματος αποθηκεύτηκαν στο αίτημά σου.')
    navigate(`/requests/${clientId}/`)
  }

  const handleSubmit = async () => {
    if (!isFormValid || submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)

    // Set once the API has stored the request. From then on a failure must not hand
    // the button back: the draft is gone, so a second tap would file a second request.
    let createdFor: string | null = null
    try {
      if (createdRequest) {
        await completeVehicleDetails(createdRequest)
        return
      }

      saveFormData({ vinNumber, engineNumber })
      const latestFormData = loadFormData()

      const body = {
        ...savedData,
        vinNumber,
        engineNumber,
        // Only the id: the server reads the saved car itself and checks it is ours.
        ...(latestFormData.originalVehicleId && { originalVehicleId: latestFormData.originalVehicleId }),
        // No clientId is sent: the API reads it from the auth cookie, so the request
        // can only ever land in the account this browser is actually signed into.
        // Signed-out visitors register inline instead.
        ...account.credentials,
      }
      // Same key for every retry of this body, so a double-fired submit is stored once.
      const serviceRequest = { ...body, submissionId: getSubmissionId(body) }

      const response = await fetch('/api/service-request/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceRequest),
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.success) {
        if (result.code === 'EMAIL_EXISTS') {
          account.onEmailTaken()
          error('Υπάρχει ήδη λογαριασμός', result.error)
        } else {
          error('Δεν στάλθηκε το αίτημα', result.error || 'Σφάλμα κατά την αποστολή. Δοκιμάστε ξανά.')
        }
        release()
        return
      }

      // The request exists from here on. The draft goes first, so neither "Πίσω" nor
      // the next request can resubmit or inherit it.
      createdFor = result.clientId
      clearFormData()

      // A brand-new account was just registered inline and the server set its auth
      // cookie, so pull the identity into AuthContext.
      if (result.isNewAccount) account.onSignedIn(result.clientId)

      // The photo goes up after the request exists: it needs the vehicle id the API
      // just minted, and for a guest the auth cookie the same call just set.
      if (licensePhoto && result.vehicleId) {
        const uploaded = await uploadLicensePhoto(result.vehicleId, licensePhoto)
        if (!uploaded) {
          // Used to be a console.warn and a redirect, leaving the garage with neither
          // the άδεια nor the numbers. Stay here until one of the two is in.
          setCreatedRequest({ clientId: result.clientId, vehicleId: result.vehicleId })
          setLicensePhoto(null)
          setHasLicensePhoto(false)
          error(
            'Η φωτογραφία της άδειας δεν στάλθηκε',
            'Το αίτημά σου καταχωρήθηκε. Συμπλήρωσε τον αριθμό πλαισίου και κινητήρα (ή δοκίμασε άλλη φωτογραφία) για να ολοκληρωθεί.'
          )
          release()
          return
        }
      }

      if (result.duplicate) {
        // An earlier attempt got through but its answer never arrived. Saying "στάλθηκε"
        // again would read as a second request.
        success(
          'Το αίτημα είχε ήδη σταλεί',
          'Δεν καταχωρήθηκε δεύτερη φορά — θα το βρεις στα αιτήματά σου.'
        )
      } else {
        success(
          'Το αίτημα στάλθηκε!',
          `${carSummary} · ${getCategoryText(savedData.category)}\n\nΤα συνεργεία ειδοποιήθηκαν. Θα δεις τις προσφορές τους στα αιτήματά σου.`
        )
      }
      navigate(`/requests/${result.clientId}/`)
    } catch (err) {
      console.error('Error submitting service request:', err)
      if (createdFor) {
        navigate(`/requests/${createdFor}/`)
        return
      }
      error('Σφάλμα', 'Σφάλμα κατά την αποστολή. Παρακαλώ δοκιμάστε ξανά.')
      release()
    }
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
          Τεχνικά Στοιχεία
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant leading-relaxed">
          Συμπληρώστε τα προχωρημένα τεχνικά στοιχεία του οχήματός σας
        </p>

        {/* Selected Vehicle summary card */}
        <div className="mt-6 bg-surface-container-lowest rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon name="directions_car" className="text-primary" size="md" />
            </div>
            <div className="min-w-0">
              <p className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                Επιλεγμένο Όχημα
              </p>
              <p className="text-sm font-bold text-on-surface">
                {carSummary}
              </p>
              <p className="text-xs text-on-surface-variant">
                {savedData.engineCC}cc &middot; {getCategoryText(savedData.category)}
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
        <EstimatedCostCard estimate={estimate} isLoading={isEstimatingPrice} />

        {createdRequest && (
          <div role="alert" className="mt-6 bg-error-container/60 border border-error/20 rounded-2xl p-4 flex items-start gap-3">
            <Icon name="error" filled size="md" className="text-error flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-on-surface">Η φωτογραφία της άδειας δεν στάλθηκε</p>
              <p className="text-xs text-on-surface-variant mt-1">
                Το αίτημά σου καταχωρήθηκε. Συμπλήρωσε τον αριθμό πλαισίου και τον αριθμό κινητήρα — ή δοκίμασε άλλη φωτογραφία — για να το λάβουν πλήρες τα συνεργεία.
              </p>
            </div>
          </div>
        )}

        {/* Main form card */}
        <div className="mt-6 space-y-6">

          {/* Email & Password for guest users */}
          {mounted && <GuestAccountFields account={account} />}

          {/* Engine Number or License Photo */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                Κινητήρας ή Άδεια
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
                      <p className="text-sm font-bold text-on-surface mb-2">Πού θα βρείτε τον αριθμό κινητήρα:</p>
                      <Image
                        src="/images/engine-number-location.jpg"
                        alt="Θέση αριθμού κινητήρα"
                        width={300}
                        height={200}
                        className="w-full h-32 object-cover rounded-lg mb-2"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NzM4NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkVuZ2luZSBOdW1iZXIgTG9jYXRpb248L3RleHQ+PC9zdmc+'
                        }}
                      />
                      <p className="text-xs text-secondary">
                        Συνήθως βρίσκεται στο μπλοκ του κινητήρα ή στην άδεια κυκλοφορίας
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
                Αριθμός Κινητήρα
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
                Φωτογραφία Άδειας Κυκλοφορίας
              </button>
            </div>

            {licensePhotoError && (
              <p role="alert" className="text-xs text-error flex items-start gap-1">
                <Icon name="error" size="sm" className="text-error shrink-0" /> {licensePhotoError}
              </p>
            )}

            {!hasLicensePhoto ? (
              <>
                {/* Without the άδεια both numbers are needed — say so up front,
                    rather than leaving the submit button grey with no reason. */}
                <p className="text-xs text-on-surface-variant">
                  Συμπληρώστε τον αριθμό κινητήρα <span className="font-bold text-on-surface">και</span> τον αριθμό πλαισίου.
                </p>
                <input
                  type="text"
                  aria-label="Αριθμός κινητήρα"
                  value={engineNumber}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9\-]/g, '')
                    setEngineNumber(val)
                  }}
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
                {/* What the document looks like and which boxes have to be readable */}
                <div className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-3">
                  <LicenseSample className="w-full h-auto" />
                  <p className="text-xs text-on-surface-variant mt-2">
                    Φωτογραφίστε την μπροστινή όψη. Τα <span className="font-bold text-primary">σημειωμένα πεδία</span> πρέπει να διαβάζονται καθαρά.
                  </p>
                </div>
                {/* Show existing license photo from vehicle */}
                {existingLicensePhotoUrl && !licensePhoto && !createdRequest && (
                  <div className="rounded-2xl overflow-hidden border-2 border-green-200 bg-green-50/50">
                    <div className="relative w-full h-48">
                      <Image
                        src={existingLicensePhotoUrl}
                        alt="Άδεια κυκλοφορίας"
                        fill
                        sizes="(max-width: 768px) 100vw, 600px"
                        className="object-contain"
                      />
                    </div>
                    <div className="p-3 flex items-center justify-between">
                      <p className="text-xs font-bold text-green-700 flex items-center gap-1">
                        <Icon name="check_circle" size="sm" className="text-green-600" />
                        Φωτογραφία από το όχημά σας
                      </p>
                      <label htmlFor="license-photo" className="text-xs font-bold text-primary cursor-pointer hover:underline">
                        Αλλαγή
                      </label>
                    </div>
                  </div>
                )}
                {/* `capture` is what opens the phone camera straight away —
                    photographing the άδεια in hand is the normal case here. */}
                <input
                  type="file"
                  id="license-photo"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <input
                  type="file"
                  id="license-photo-camera"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {(!existingLicensePhotoUrl || licensePhoto || createdRequest) && (
                  <>
                    <div className="grid grid-cols-2 gap-3 md:hidden">
                      <label
                        htmlFor="license-photo-camera"
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl machined-gradient text-white py-5 cursor-pointer active:scale-95 transition-transform shadow-lg shadow-primary/20"
                      >
                        <Icon name="photo_camera" size="lg" filled />
                        <span className="text-sm font-bold">Κάμερα</span>
                      </label>
                      <label
                        htmlFor="license-photo"
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-surface-container-highest text-on-surface py-5 cursor-pointer active:scale-95 transition-transform"
                      >
                        <Icon name="photo_library" size="lg" filled className="text-on-surface-variant" />
                        <span className="text-sm font-bold">Συλλογή</span>
                      </label>
                    </div>

                    <div className={`hidden md:block border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
                      dragActive ? 'border-primary bg-primary/5' : 'border-outline-variant/30 hover:border-primary'
                    }`}>
                      <label htmlFor="license-photo" className="cursor-pointer">
                        {isPreparingPhoto ? (
                          <div className="text-on-surface-variant flex flex-col items-center">
                            <Spinner size="md" className="text-primary mb-2" />
                            <p className="text-sm font-bold">Επεξεργασία φωτογραφίας...</p>
                          </div>
                        ) : licensePhoto ? (
                          <div className="text-green-600">
                            <Icon name="photo" size="lg" className="mx-auto mb-2" />
                            <p className="text-sm font-bold">{licensePhoto.name}</p>
                            <p className="text-xs text-on-surface-variant">Κάνε κλικ για αλλαγή</p>
                          </div>
                        ) : (
                          <div className="text-on-surface-variant">
                            <Icon name="cloud_upload" size="lg" className="mx-auto mb-2" />
                            <p className="text-sm font-bold">
                              {dragActive ? 'Άφησε τη φωτογραφία' : 'Κάνε κλικ ή σύρε τη φωτογραφία εδώ'}
                            </p>
                            <p className="text-xs text-on-surface-variant">JPG, PNG ή HEIC</p>
                          </div>
                        )}
                      </label>
                    </div>

                    {/* On mobile the two buttons above replace the box, so the
                        chosen file needs its own confirmation line. */}
                    {(licensePhoto || isPreparingPhoto) && (
                      <div className="md:hidden flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 px-4 py-3">
                        {isPreparingPhoto
                          ? <Spinner size="sm" className="text-green-600" />
                          : <Icon name="check_circle" filled size="sm" className="text-green-600" />}
                        <p className="text-xs font-bold text-green-700 truncate">
                          {isPreparingPhoto ? 'Επεξεργασία φωτογραφίας...' : licensePhoto?.name}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* VIN Number — only when NOT uploading license photo */}
          {!hasLicensePhoto && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                Αριθμός Πλαισίου <span className="text-error">*</span>
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
                      <p className="text-sm font-bold text-on-surface mb-2">Πού θα βρείτε τον αριθμό πλαισίου:</p>
                      <Image
                        src="/images/vin-number-location.jpg"
                        alt="Θέση αριθμού πλαισίου VIN"
                        width={300}
                        height={200}
                        className="w-full h-32 object-cover rounded-lg mb-2"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NzM4NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPldJTiBOdW1iZXIgTG9jYXRpb248L3RleHQ+PC9zdmc+'
                        }}
                      />
                      <p className="text-xs text-secondary">
                        Βρίσκεται στο ταμπλό (κάτω από το παρμπρίζ), στο πλαίσιο της πόρτας του οδηγού ή στην άδεια κυκλοφορίας
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="relative">
              <input
                type="text"
                aria-label="Αριθμός πλαισίου"
                value={vinNumber}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                  setVinNumber(val)
                }}
                placeholder="π.χ. WVWZZZ1JZ3W386752"
                className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 pr-12 font-medium text-on-surface focus:ring-2 focus:ring-primary/20 transition-all"
                maxLength={17}
              />
              <Icon name="pin" className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size="md" />
            </div>
            {vinNumber && vinNumber.length > 0 && (
              <p className="text-xs text-on-surface-variant">
                {vinNumber.length}/17 χαρακτήρες
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
            label={createdRequest ? 'ΟΛΟΚΛΗΡΩΣΗ' : 'ΑΠΟΣΤΟΛΗ ΑΙΤΗΜΑΤΟΣ'}
          />

          {/* Back link — once the request exists there is nothing to go back to. */}
          {!createdRequest && (
            <div className="mt-3 text-center">
              <button
                onClick={back}
                disabled={isNavigating('__back__') || isSubmitting}
                className="inline-flex items-center gap-1 text-primary hover:text-primary-container font-bold text-sm transition-colors duration-200 disabled:opacity-60"
              >
                {isNavigating('__back__') && <Spinner size="sm" />}
                Επιστροφή
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
