'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useToast } from '@/hooks/useToast'
import { compressImages } from '@/utils/imageCompression'
import { useFileDrop } from '@/hooks/useFileDrop'

const MAX_PHOTOS = 12

interface RequestPhotosCardProps {
  requestId: string
  /** Presigned URLs, in upload order. */
  photoUrls: string[]
  /** Hidden once the job is booked — the photos become part of the record. */
  canAdd?: boolean
  /** Called after a successful upload so the parent can refetch the request. */
  onPhotosAdded?: () => void | Promise<void>
}

/**
 * The photos on a service request, and the control to add more.
 *
 * Adding photos after submission is the only route to a photo at all for most
 * requests: the submission wizard asks for them on the bodywork categories and
 * nowhere else, so a client with a mechanical fault had no way to show the
 * garage anything. Photos here are part of the request itself, which means
 * every garage bidding on it sees them — unlike a photo sent in chat, which
 * stays with the one garage in that conversation.
 */
export default function RequestPhotosCard({
  requestId,
  photoUrls,
  canAdd = true,
  onPhotosAdded,
}: RequestPhotosCardProps) {
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const count = photoUrls.length
  const remaining = MAX_PHOTOS - count
  const showAdd = canAdd && remaining > 0

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'))
    // Reset so re-picking the same file fires onChange, and the camera can be
    // reopened straight after a retake.
    e.target.value = ''
    await uploadFiles(picked)
  }

  const uploadFiles = async (picked: File[]) => {
    if (picked.length === 0) return

    setUploading(true)
    try {
      // Re-encoded to JPEG and scaled down first: a raw batch of phone photos
      // is tens of megabytes, which is both slow on mobile data and larger
      // than the request body the hosting layer will carry.
      const compressed = await compressImages(picked.slice(0, remaining))
      const form = new FormData()
      compressed.forEach((file) => form.append('files', file))
      form.append('serviceRequestId', requestId)

      const response = await fetch('/api/upload-photos/', { method: 'POST', body: form })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        showToast({ type: 'error', title: data.error || 'Η αποστολή των φωτογραφιών απέτυχε' })
        return
      }

      if ((data.rejected?.length ?? 0) > 0) {
        showToast({
          type: 'warning',
          title: 'Κάποιες φωτογραφίες δεν στάλθηκαν',
          message: (data.rejected as string[]).join('\n'),
        })
      } else {
        showToast({ type: 'success', title: 'Οι φωτογραφίες στάλθηκαν' })
      }

      await onPhotosAdded?.()
    } catch {
      showToast({ type: 'error', title: 'Η αποστολή των φωτογραφιών απέτυχε' })
    } finally {
      setUploading(false)
    }
  }

  // Dropping a photo onto a page with no drop handling makes the browser
  // navigate to the file and replace the page, so the window is the target.
  const { dragActive } = useFileDrop(uploadFiles, {
    disabled: !showAdd || uploading,
    accept: (file) => file.type.startsWith('image/'),
  })

  if (count === 0 && !showAdd) return null

  return (
    <div className={`bg-surface-container-lowest rounded-xl p-5 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border transition-colors ${
      dragActive ? 'border-primary bg-primary/5' : 'border-outline-variant/10'
    }`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
          <Icon name="photo_library" size="md" className="text-on-surface-variant" />
          Φωτογραφίες{count > 0 ? ` (${count})` : ''}
        </h3>

        {showAdd && (
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFiles}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFiles}
              className="hidden"
            />
            {/* Phones get a direct shortcut to the camera; on desktop `capture`
                does nothing useful, so the button would just be a second
                file picker. */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="md:hidden flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/15 transition-colors disabled:opacity-50 active:scale-95"
              aria-label="Λήψη φωτογραφίας"
            >
              <Icon name="photo_camera" size="sm" filled />
              Κάμερα
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/15 transition-colors disabled:opacity-50 active:scale-95"
            >
              {uploading ? <Spinner size="sm" /> : <Icon name="add_a_photo" size="sm" />}
              {uploading ? 'Αποστολή...' : 'Προσθήκη'}
            </button>
          </div>
        )}
      </div>

      {count === 0 ? (
        <p className="text-sm text-secondary leading-relaxed">
          Ανεβάστε φωτογραφίες της βλάβης — τις βλέπουν όλα τα συνεργεία που δίνουν προσφορά, και
          βοηθούν να έρθει πιο ακριβής τιμή.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {photoUrls.map((url, index) => (
            <button
              key={index}
              onClick={() => setLightboxIndex(index)}
              className="relative aspect-square bg-surface-container rounded-xl overflow-hidden active:scale-95 transition-transform"
              aria-label={`Άνοιγμα φωτογραφίας ${index + 1}`}
            >
              <Image
                src={url}
                alt={`Φωτογραφία ${index + 1}`}
                fill
                sizes="(max-width: 640px) 100vw, 33vw"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {lightboxIndex !== null && photoUrls[lightboxIndex] && (
        <div
          className="fixed inset-0 z-[100] bg-on-surface/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-surface/20 hover:bg-surface/30 flex items-center justify-center transition-colors"
            aria-label="Κλείσιμο"
          >
            <Icon name="close" size="md" className="text-white" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- presigned and
              short-lived, so the image optimiser would only add a dead cache entry. */}
          <img
            src={photoUrls[lightboxIndex]}
            alt={`Φωτογραφία ${lightboxIndex + 1}`}
            className="max-h-[85vh] max-w-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
