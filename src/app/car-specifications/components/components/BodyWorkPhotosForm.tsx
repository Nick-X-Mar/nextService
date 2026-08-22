'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import GearSubmitButton from '@/components/GearSubmitButton'
import { useToast } from '../../../../hooks/useToast'
import { loadFormData } from '../../../../utils/formStorage'
import { usePriceEstimate } from '@/hooks/usePriceEstimate'
import { compressImages } from '@/utils/imageCompression'
import { useFileDrop } from '@/hooks/useFileDrop'
import EstimatedCostCard from './EstimatedCostCard'
import Image from 'next/image'

interface BodyWorkPhotosFormProps {
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

export default function BodyWorkPhotosForm({ savedData }: BodyWorkPhotosFormProps) {
  const router = useRouter()
  const { success, error } = useToast()
  const [photos, setPhotos] = useState<File[]>([])
  // Covers the whole submit: create the request, then push the photos to S3.
  // Stays true through the redirect so the button doesn't flick back to idle
  // while the requests page is still loading.
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { estimate, isLoading: isEstimatingPrice } = usePriceEstimate(savedData)

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
    // Filter only image files and limit to 3 total
    const imageFiles = newFiles.filter(file => file.type.startsWith('image/'))
    const availableSlots = 3 - photos.length
    const filesToAdd = imageFiles.slice(0, availableSlots)

    setPhotos(prev => [...prev, ...filesToAdd])
  }

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  // Whole-window drop. Dropping just outside the dashed box used to make the
  // browser open the photo as a page, losing the half-filled form.
  const { dragActive } = useFileDrop(addPhotos, {
    disabled: photos.length >= 3,
    accept: (file) => file.type.startsWith('image/'),
  })

  const isFormValid = photos.length >= 1

  const handleSubmit = async () => {
    if (isFormValid && !isSubmitting) {
      setIsSubmitting(true)
      try {
        // Load latest form data to include originalVehicleId and originalVehicleData
        const latestFormData = loadFormData()

        // First, create the service request to get IDs
        const serviceRequestData = {
          ...savedData,
          photos: photos.map(p => ({ name: p.name, size: p.size, type: p.type })),
          // Persist the estimate the customer was shown (the API field is estimatedCost)
          ...(estimate && { estimatedCost: estimate.estimatedCost }),
          // Include original vehicle tracking data if present
          ...(latestFormData.originalVehicleId && { originalVehicleId: latestFormData.originalVehicleId }),
          ...(latestFormData.originalVehicleData && { originalVehicleData: latestFormData.originalVehicleData }),
          // No clientId: the API takes it from the auth cookie, so the request
          // can only land in the account this browser is actually signed into.
        }

        const serviceResponse = await fetch('/api/service-request/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(serviceRequestData),
        })

        if (!serviceResponse.ok) {
          throw new Error('Network response was not ok')
        }

        const serviceResult = await serviceResponse.json()

        if (!serviceResult.success) {
          error('Σφαλμα', serviceResult.error || 'Αγνωστο σφαλμα')
          setIsSubmitting(false)
          return
        }

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
        })

        const uploadResult = await uploadResponse.json().catch(() => ({}))

        // The request itself already exists at this point. Failing the whole
        // submission here is what produced the duplicate requests in the data:
        // people saw an error, went back and submitted the same job again.
        // Take them to the request either way and be honest about the photos —
        // they can add them from the request page.
        if (!uploadResponse.ok || !uploadResult.success) {
          error(
            'Οι φωτογραφίες δεν στάλθηκαν',
            'Το αίτημά σου καταχωρήθηκε κανονικά. Μπορείς να προσθέσεις τις φωτογραφίες από τη σελίδα του αιτήματος.'
          )
        } else if ((uploadResult.rejected?.length ?? 0) > 0) {
          success(
            'Το αίτημα στάλθηκε',
            `Στάλθηκαν ${uploadResult.photoData?.length ?? 0} από ${photos.length} φωτογραφίες. Μπορείς να προσθέσεις κι άλλες από τη σελίδα του αιτήματος.`
          )
        } else {
          success(
            'Επιτυχία!',
            `Στάλθηκαν ${photos.length} φωτογραφίες και ειδοποιήθηκαν ${serviceResult.notificationsSent} συνεργεία.`
          )
        }

        if (serviceResult.clientId) {
          router.push(`/requests/${serviceResult.clientId}/`)
        } else {
          router.push('/requests/')
        }
      } catch (err) {
        console.error('Error submitting service request:', err)
        error('Σφάλμα', 'Σφάλμα κατά την αποστολή. Παρακαλώ δοκίμασε ξανά.')
        setIsSubmitting(false)
      }
    }
  }

  const handleGoBack = () => {
    router.back()
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
          Φωτογραφιες Ζημιας
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant leading-relaxed">
          Ανεβαστε 1-3 φωτογραφιες για αξιολογηση της εργασιας
        </p>

        {/* Selected Vehicle summary card */}
        <div className="mt-6 bg-surface-container-lowest rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon name="directions_car" className="text-primary" size="md" />
            </div>
            <div>
              <p className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                ΕΠΙΛΕΓΜΕΝΟ ΟΧΗΜΑ
              </p>
              <p className="text-sm font-bold text-on-surface">
                {savedData.brand} {savedData.model}
              </p>
              <p className="text-xs text-on-surface-variant">Φανοποιεια</p>
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

          {/* Photo Upload Area */}
          <div className="space-y-4">
            <label className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
              Φωτογραφιες Ζημιας ({photos.length}/3)
            </label>

            {photos.length < 3 && (
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
                    <span className="text-sm font-bold">Καμερα</span>
                  </label>
                  <label
                    htmlFor="damage-photos"
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-surface-container-highest text-on-surface py-5 cursor-pointer active:scale-95 transition-transform"
                  >
                    <Icon name="photo_library" size="lg" filled className="text-on-surface-variant" />
                    <span className="text-sm font-bold">Συλλογη</span>
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
                      {dragActive ? 'Αφησε τις φωτογραφιες' : 'Κανε κλικ η συρε φωτογραφιες εδω'}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      JPG, PNG μεχρι 10MB ανα φωτογραφια
                    </p>
                    <p className="text-[10px] text-on-surface-variant/50 mt-1">
                      Μεχρι {3 - photos.length} ακομα φωτογραφι{3 - photos.length === 1 ? 'α' : 'ες'}
                    </p>
                  </label>
                </div>
              </>
            )}

            {/* Photo Preview Grid */}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {photos.map((photo, index) => (
                  <div key={index} className="relative group">
                    <div className="relative aspect-square bg-surface-container rounded-xl overflow-hidden">
                      <Image
                        src={URL.createObjectURL(photo)}
                        alt={`Φωτογραφια ${index + 1}`}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <button
                      onClick={() => removePhoto(index)}
                      className="absolute -top-2 -right-2 bg-tertiary text-on-tertiary rounded-full h-6 w-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md"
                      title="Διαγραφη φωτογραφιας"
                    >
                      <Icon name="close" size="sm" />
                    </button>
                    <p className="text-[10px] text-on-surface-variant mt-1 truncate">
                      {photo.name}
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
                <h4 className="text-xs font-bold text-on-surface mb-1">Συμβουλες για καλες φωτογραφιες:</h4>
                <ul className="text-[11px] text-on-surface-variant space-y-0.5">
                  <li>Φωτογραφιστε τη ζημια απο κοντα και απο μακρια</li>
                  <li>Χρησιμοποιηστε καλο φωτισμο (φυσικο φως)</li>
                  <li>Συμπεριλαβετε το περιβαλλον της ζημιας</li>
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
              loadingLabel="Αποστολη φωτογραφιων..."
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
      </div>
    </section>
  )
}
