'use client'

import { useState } from 'react'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import PhotoViewer from '@/components/PhotoViewer'
import { styles } from '@/styles/styles'

/**
 * The άδεια κυκλοφορίας the customer photographed, shown to both sides of the
 * request: the client sees what they sent, the garage reads the numbers off it
 * instead of asking for them. The URL is presigned and short-lived, so this is
 * always rendered from a fresh fetch rather than cached anywhere.
 */
export default function LicensePhotoCard({ url }: { url?: string | null }) {
  const [open, setOpen] = useState(false)

  // Only a presigned https URL is renderable. A raw S3 key (what an unsigned
  // response carries) makes next/image throw and takes the whole page down with it.
  if (!url || !url.startsWith('https://')) return null

  return (
    <div className={styles.card}>
      <div className="flex items-center gap-2 mb-4">
        <Icon name="badge" size="md" className="text-primary" filled />
        <p className={styles.labelUpper}>Άδεια Κυκλοφορίας</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block relative w-full h-56 bg-surface-container rounded-xl overflow-hidden hover:opacity-90 transition-opacity"
        aria-label="Άνοιγμα άδειας κυκλοφορίας"
      >
        <Image
          src={url}
          alt="Άδεια κυκλοφορίας"
          fill
          sizes="(max-width: 640px) 100vw, 600px"
          className="object-contain"
        />
      </button>
      <p className="text-xs text-on-surface-variant mt-2">
        Πατήστε τη φωτογραφία για να ανοίξει σε πλήρες μέγεθος. Με διπλό πάτημα μεγεθύνεται.
      </p>
      {open && (
        <PhotoViewer photos={[{ url, alt: 'Άδεια κυκλοφορίας' }]} startIndex={0} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
