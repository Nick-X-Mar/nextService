'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import GearSubmitButton from '@/components/GearSubmitButton'
import { useToast } from '../../../../hooks/useToast'
import { loadFormData } from '../../../../utils/formStorage'
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
  const [dragActive, setDragActive] = useState(false)

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

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = Array.from(e.dataTransfer.files)
    addPhotos(files)
  }

  const isFormValid = photos.length >= 1

  const handleSubmit = async () => {
    if (isFormValid) {
      try {
        // Load latest form data to include originalVehicleId and originalVehicleData
        const latestFormData = loadFormData()

        // Get client ID from localStorage if user is logged in
        const loggedInClientId = localStorage.getItem('clientId')

        // First, create the service request to get IDs
        const serviceRequestData = {
          ...savedData,
          photos: photos.map(p => ({ name: p.name, size: p.size, type: p.type })),
          // Include original vehicle tracking data if present
          ...(latestFormData.originalVehicleId && { originalVehicleId: latestFormData.originalVehicleId }),
          ...(latestFormData.originalVehicleData && { originalVehicleData: latestFormData.originalVehicleData }),
          // Include client ID if user is logged in
          ...(loggedInClientId && { clientId: loggedInClientId })
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
          return
        }

        // Now upload photos to S3
        const formData = new FormData()
        photos.forEach(file => {
          formData.append('files', file)
        })
        formData.append('serviceRequestId', serviceResult.serviceRequestId)
        formData.append('vehicleId', serviceResult.vehicleId)

        const uploadResponse = await fetch('/api/upload-photos/', {
          method: 'POST',
          body: formData,
        })

        if (!uploadResponse.ok) {
          throw new Error('Photo upload failed')
        }

        const uploadResult = await uploadResponse.json()

        if (uploadResult.success) {
          success(
            'Επιτυχια!',
            `Σταλθηκαν ${photos.length} φωτογραφιες για αξιολογηση της ζημιας\n\nΣταλθηκε ειδοποιηση σε ${serviceResult.notificationsSent} συνεργεια μεσω SMS!\n\nΦωτογραφιες αποθηκευτηκαν στο S3: ${uploadResult.s3Folder}\n\nΑνακατευθυνση στη σελιδα αιτηματων...`
          )

          // Redirect to requests page with clientId
          if (serviceResult.clientId) {
            router.push(`/requests/${serviceResult.clientId}/`)
          } else {
            router.push('/requests/')
          }
        } else {
          error('Σφαλμα', uploadResult.error || 'Αγνωστο σφαλμα')
        }
      } catch (err) {
        console.error('Error submitting service request:', err)
        error('Σφαλμα', 'Σφαλμα κατα την αποστολη. Παρακαλω δοκιμαστε ξανα.')
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

        {/* Main form area */}
        <div className="mt-6 space-y-6">

          {/* Photo Upload Area */}
          <div className="space-y-4">
            <label className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
              Φωτογραφιες Ζημιας ({photos.length}/3)
            </label>

            {photos.length < 3 && (
              <div
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 ${
                  dragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant/30 hover:border-primary'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  id="damage-photos"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label htmlFor="damage-photos" className="cursor-pointer">
                  <Icon name="cloud_upload" size="xl" className="mx-auto mb-3 text-on-surface-variant/40" />
                  <p className="text-sm font-bold text-on-surface">
                    Κανε κλικ η συρε φωτογραφιες εδω
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    JPG, PNG μεχρι 10MB ανα φωτογραφια
                  </p>
                  <p className="text-[10px] text-on-surface-variant/50 mt-1">
                    Μεχρι {3 - photos.length} ακομα φωτογραφι{3 - photos.length === 1 ? 'α' : 'ες'}
                  </p>
                </label>
              </div>
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
            <GearSubmitButton onClick={handleSubmit} disabled={!isFormValid} />

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
