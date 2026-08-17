'use client'

import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import { styles } from '@/styles/styles'

/**
 * The άδεια κυκλοφορίας the customer photographed, shown to both sides of the
 * request: the client sees what they sent, the garage reads the numbers off it
 * instead of asking for them. The URL is presigned and short-lived, so this is
 * always rendered from a fresh fetch rather than cached anywhere.
 */
export default function LicensePhotoCard({ url }: { url?: string | null }) {
  if (!url) return null

  return (
    <div className={styles.card}>
      <div className="flex items-center gap-2 mb-4">
        <Icon name="badge" size="md" className="text-primary" filled />
        <p className={styles.labelUpper}>Άδεια Κυκλοφορίας</p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative w-full h-56 bg-surface-container rounded-xl overflow-hidden hover:opacity-90 transition-opacity"
      >
        <Image
          src={url}
          alt="Άδεια κυκλοφορίας"
          fill
          sizes="(max-width: 640px) 100vw, 600px"
          className="object-contain"
        />
      </a>
      <p className="text-xs text-on-surface-variant mt-2">
        Πατήστε τη φωτογραφία για να ανοίξει σε πλήρες μέγεθος.
      </p>
    </div>
  )
}
