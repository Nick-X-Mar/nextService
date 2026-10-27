'use client'

import { useState, useEffect, useRef } from 'react'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import GearSubmitButton from '@/components/GearSubmitButton'
import { useToast } from '../../../../hooks/useToast'
import { useNavigation } from '@/hooks/useNavigation'
import { loadFormData, clearFormData, getSubmissionId } from '../../../../utils/formStorage'
import { usePriceEstimate } from '@/hooks/usePriceEstimate'
import { compressImages } from '@/utils/imageCompression'
import { getCategoryText } from '@/utils/categoryLabels'
import { useFileDrop } from '@/hooks/useFileDrop'
import EstimatedCostCard from './EstimatedCostCard'
import GuestAccountFields, { useGuestAccount } from './GuestAccount'
import Image from 'next/image'

interface BodyWorkPhotosFormProps {
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
  }
}

const MAX_PHOTOS = 3

export default function BodyWorkPhotosForm({ savedData }: BodyWorkPhotosFormProps) {
  const { navigate, back, isNavigating } = useNavigation()
  const { success, error } = useToast()
  const account = useGuestAccount()
  const [photos, setPhotos] = useState<File[]>([])
  // Covers the whole submit: create the request, then push the photos to S3.
  // Stays true through the redirect so the button doesn't flick back to idle
  // while the requests page is still loading.
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const { estimate, isLoading: isEstimatingPrice } = usePriceEstimate(savedData)

  // One object URL per photo, released when the set changes. Minting them inline in
  // render made a new blob URL — and reloaded every thumbnail — on each keystroke in
  // the sign-up fields above.
  const [previews, setPreviews] = useState<string[]>([])
  useEffect(() => {
    const urls = photos.map((photo) => URL.createObjectURL(photo))
    setPreviews(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [photos])

  // Track form funnel
  useEffect(() => {
    const clientId = localStorage.getItem('clientId')
    fetch('/api/track/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'car_specs_started', clientId }),
    }).catch(() => {})
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    addPhotos(files)
    // Reset so re-picking the same file still fires onChange — and so the
    // camera input can be used twice in a row.
    e.target.value = ''
  }

  const addPhotos = (newFiles: File[]) => {
    const imageFiles = newFiles.filter(file => file.type.startsWith('image/'))
    setPhotos(prev => [...prev, ...imageFiles].slice(0, MAX_PHOTOS))
  }

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  // Whole-window drop. Dropping just outside the dashed box used to make the
  // browser open the photo as a page, losing the half-filled form.
  const { dragActive } = useFileDrop(addPhotos, {
    disabled: photos.length >= MAX_PHOTOS,
    accept: (file) => file.type.startsWith('image/'),
  })

  const isFormValid = photos.length >= 1 && account.isReady

  const release = () => {
    submittingRef.current = false
    setIsSubmitting(false)
  }

  const handleSubmit = async () => {
    if (!isFormValid || submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)

    // Set once the API has stored the request. From then on a failure must not hand
    // the button back: the draft is gone, so a second tap would file a second request.
    let createdFor: string | null = null
    try {
      const latestFormData = loadFormData()

      // First, create the service request to get IDs
      const body = {
        ...savedData,
        // Not shown on this form, but part of the saved car the customer picked —
        // sent so the server sees the same car rather than an edited copy.
        engineNumber: latestFormData.engineNumber || '',
        ...(latestFormData.originalVehicleId && { originalVehicleId: latestFormData.originalVehicleId }),
        // No clientId: the API takes it from the auth cookie, so the request
        // can only land in the account this browser is actually signed into.
        ...account.credentials,
      }
      // Same key for every retry of this body, so a double-fired submit is stored once.
      const serviceRequestData = { ...body, submissionId: getSubmissionId(body) }

      const serviceResponse = await fetch('/api/service-request/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceRequestData),
      })
      const serviceResult = await serviceResponse.json().catch(() => ({}))

      if (!serviceResponse.ok || !serviceResult.success) {
        if (serviceResult.code === 'EMAIL_EXISTS') {
          account.onEmailTaken()
          error('Υπάρχει ήδη λογαριασμός', serviceResult.error)
        } else {
          error('Δεν στάλθηκε το αίτημα', serviceResult.error || 'Σφάλμα κατά την αποστολή. Δοκίμασε ξανά.')
        }
        release()
        return
      }

      // The request exists from here on; nothing below may lose it or resend it.
      createdFor = serviceResult.clientId
      clearFormData()
      if (serviceResult.isNewAccount) account.onSignedIn(serviceResult.clientId)

      // Scaled down and re-encoded to JPEG first. Straight off a phone these
      // are 3-8MB each and often HEIC, which the API rejected — and because
      // one bad file used to fail the whole batch, people ended up with a
      // request carrying no photos at all.
      const compressed = await compressImages(photos)

      const formData = new FormData()
      compressed.forEach(file => {
        formData.append('files', file)
      })
      formData.append('serviceRequestId', serviceResult.serviceRequestId)

      const uploadResponse = await fetch('/api/upload-photos/', {
        method: 'POST',
        body: formData,
      }).catch(() => null)
      const uploadResult = uploadResponse ? await uploadResponse.json().catch(() => ({})) : {}

      // The request itself already exists at this point. Failing the whole
      // submission here is what produced the duplicate requests in the data:
      // people saw an error, went back and submitted the same job again.
      // Take them to the request either way and be honest about the photos —
      // they can add them from the request page.
      if (!uploadResponse?.ok || !uploadResult.success) {
        error(
          'Οι φωτογραφίες δεν στάλθηκαν',
          'Το αίτημά σου καταχωρήθηκε κανονικά. Μπορείς να προσθέσεις τις φωτογραφίες από τη σελίδα του αιτήματος.'
        )
      } else if (serviceResult.duplicate) {
        // An earlier attempt got through but its answer never arrived. Saying
        // "στάλθηκε" again would read as a second request.
        success(
          'Το αίτημα είχε ήδη σταλεί',
          'Δεν καταχωρήθηκε δεύτερη φορά — θα το βρεις στα αιτήματά σου μαζί με τις φωτογραφίες.'
        )
      } else if ((uploadResult.rejected?.length ?? 0) > 0) {
        success(
          'Το αίτημα στάλθηκε',
          `Στάλθηκαν ${uploadResult.photoData?.length ?? 0} από ${photos.length} φωτογραφίες. Μπορείς να προσθέσεις κι άλλες από τη σελίδα του αιτήματος.`
        )
      } else {
        success(
          'Το αίτημα στάλθηκε!',
          `Στάλθηκαν ${photos.length} ${photos.length === 1 ? 'φωτογραφία' : 'φωτογραφίες'}. Τα συνεργεία ειδοποιήθηκαν και θα δεις τις προσφορές τους στα αιτήματά σου.`
        )
      }

      navigate(`/requests/${serviceResult.clientId}/`)
    } catch (err) {
      console.error('Error submitting service request:', err)
      if (createdFor) {
        navigate(`/requests/${createdFor}/`)
        return
      }
      error('Σφάλμα', 'Σφάλμα κατά την αποστολή. Παρακαλώ δοκίμασε ξανά.')
      release()
    }
  }

  return (
    <section className="pb-40 pt-8">
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
          Φωτογραφίες Ζημιάς
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant leading-relaxed">
          Ανεβάστε 1-3 φωτογραφίες για αξιολόγηση της εργασίας
        </p>

        {/* Selected Vehicle summary card */}
        <div className="mt-6 bg-surface-container-lowest rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon name="directions_car" className="text-primary" size="md" />
            </div>
            <div>
              <p className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                Επιλεγμένο Όχημα
              </p>
              <p className="text-sm font-bold text-on-surface">
                {savedData.brand} {savedData.model}{savedData.modelYear ? ` (${savedData.modelYear})` : ''}
              </p>
              <p className="text-xs text-on-surface-variant">{getCategoryText(savedData.category)}</p>
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

        {/* Main form area */}
        <div className="mt-6 space-y-6">

          {/* Email & Password for guest users — bodywork used to have none, so a
              guest could never actually send one. */}
          <GuestAccountFields account={account} />

          {/* Photo Upload Area */}
          <div className="space-y-4">
            <label className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
              Φωτογραφίες Ζημιάς ({photos.length}/{MAX_PHOTOS})
            </label>

            {photos.length < MAX_PHOTOS && (
              <>
                {/* Both inputs are always in the DOM; `capture` is what makes a
                    phone open the camera directly instead of the gallery. */}
                <input
                  type="file"
                  id="damage-photos"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
                <input
                  type="file"
                  id="damage-photos-camera"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {/* Phones: shoot or pick, no drag-and-drop to speak of. */}
                <div className="grid grid-cols-2 gap-3 md:hidden">
                  <label
                    htmlFor="damage-photos-camera"
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl machined-gradient text-white py-5 cursor-pointer active:scale-95 transition-transform shadow-lg shadow-primary/20"
                  >
                    <Icon name="photo_camera" size="lg" filled />
                    <span className="text-sm font-bold">Κάμερα</span>
                  </label>
                  <label
                    htmlFor="damage-photos"
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-surface-container-highest text-on-surface py-5 cursor-pointer active:scale-95 transition-transform"
                  >
                    <Icon name="photo_library" size="lg" filled className="text-on-surface-variant" />
                    <span className="text-sm font-bold">Συλλογή</span>
                  </label>
                </div>

                {/* Desktop: the drop target is the whole window (see useFileDrop),
                    this box is just where we say so. */}
                <div
                  className={`hidden md:block border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 ${
                    dragActive
                      ? 'border-primary bg-primary/5'
                      : 'border-outline-variant/30 hover:border-primary'
                  }`}
                >
                  <label htmlFor="damage-photos" className="cursor-pointer">
                    <Icon name="cloud_upload" size="xl" className="mx-auto mb-3 text-on-surface-variant/40" />
                    <p className="text-sm font-bold text-on-surface">
                      {dragActive ? 'Άφησε τις φωτογραφίες' : 'Κάνε κλικ ή σύρε φωτογραφίες εδώ'}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      JPG, PNG ή HEIC — μικραίνουν αυτόματα πριν σταλούν
                    </p>
                    <p className="text-[10px] text-on-surface-variant/50 mt-1">
                      Μέχρι {MAX_PHOTOS - photos.length} ακόμα {MAX_PHOTOS - photos.length === 1 ? 'φωτογραφία' : 'φωτογραφίες'}
                    </p>
                  </label>
                </div>
              </>
            )}

            {/* Photo Preview Grid */}
            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {previews.map((preview, index) => (
                  <div key={preview} className="relative group">
                    <div className="relative aspect-square bg-surface-container rounded-xl overflow-hidden">
                      <Image
                        src={preview}
                        alt={`Φωτογραφία ${index + 1}`}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      disabled={isSubmitting}
                      className="absolute -top-2 -right-2 bg-tertiary text-on-tertiary rounded-full h-6 w-6 flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 shadow-md"
                      title="Διαγραφή φωτογραφίας"
                      aria-label={`Διαγραφή φωτογραφίας ${index + 1}`}
                    >
                      <Icon name="close" size="sm" />
                    </button>
                    <p className="text-[10px] text-on-surface-variant mt-1 truncate">
                      {photos[index]?.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tips card */}
          <div className="p-4 bg-surface-container-lowest rounded-2xl">
            <div className="flex items-start gap-3">
              <Icon name="lightbulb" size="md" className="text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-on-surface mb-1">Συμβουλές για καλές φωτογραφίες:</h4>
                <ul className="text-[11px] text-on-surface-variant space-y-0.5">
                  <li>Φωτογραφίστε τη ζημιά από κοντά και από μακριά</li>
                  <li>Χρησιμοποιήστε καλό φωτισμό (φυσικό φως)</li>
                  <li>Συμπεριλάβετε το περιβάλλον της ζημιάς</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed bottom section */}
        <div className="fixed bottom-0 left-0 right-0 bg-surface/80 backdrop-blur-xl border-t border-outline-variant/10 px-5 pt-4 pb-8 z-30">
          <div className="max-w-lg mx-auto">
            {/* CTA Button */}
            <GearSubmitButton
              onClick={handleSubmit}
              disabled={!isFormValid}
              isLoading={isSubmitting}
              label="ΑΠΟΣΤΟΛΗ ΑΙΤΗΜΑΤΟΣ"
              loadingLabel="Αποστολή φωτογραφιών..."
            />

            {/* Back link */}
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
          </div>
        </div>
      </div>
    </section>
  )
}
