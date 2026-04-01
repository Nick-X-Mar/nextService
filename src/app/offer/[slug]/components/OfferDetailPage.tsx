'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import Icon from '@/components/ui/Icon'
import { Badge } from '@/components/ui/badge'
import { saveFormData } from '@/utils/formStorage'

interface Offer {
  id: string
  slug: string
  image: string
  title: string
  subtitle: string
  description: string
  details: string[]
  price: string
  priceNum: number
  category: string
  workType: string
  duration: string
  icon: string
}

export default function OfferDetailPage({ offer }: { offer: Offer }) {
  const router = useRouter()
  const [shared, setShared] = useState(false)

  const handleGetOffer = useCallback(() => {
    saveFormData({
      category: offer.category,
      description: offer.workType,
    })
    router.push('/car-details')
  }, [offer, router])

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/offer/${offer.slug}`
    const shareData = {
      title: `${offer.title} - ${offer.price} | NextService`,
      text: `${offer.title} από ${offer.price}. ${offer.description}`,
      url,
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(url)
      setShared(true)
      setTimeout(() => setShared(false), 2000)
    }
  }, [offer])

  return (
    <div className="min-h-screen bg-surface">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 h-14">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <Icon name="arrow_back" size="md" />
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors px-3 py-2 rounded-xl hover:bg-surface-container-high"
          >
            <Icon name={shared ? 'check' : 'share'} size="md" />
            <span className="text-sm font-medium">
              {shared ? 'Αντιγράφηκε!' : 'Κοινοποίηση'}
            </span>
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-48">
        {/* Image Section */}
        {offer.image ? (
          <div className="mt-4 aspect-[16/10] w-full overflow-hidden rounded-2xl bg-surface-container-high">
            <img
              src={offer.image}
              alt={offer.title}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="mt-4 aspect-[16/10] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary-container/40 via-primary-container/20 to-surface-container-lowest flex items-center justify-center">
            <span
              className="material-symbols-outlined text-primary/40"
              style={{
                fontSize: 80,
                fontVariationSettings:
                  "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48",
              }}
            >
              {offer.icon}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="mt-6 space-y-4">
          {/* Category badge */}
          <Badge className="rounded-full bg-primary-container/30 text-primary border-primary/20 text-xs font-bold uppercase tracking-wider">
            {offer.category === 'fanopeia' ? 'Φανοποιεία' : 'Service'}
          </Badge>

          {/* Title */}
          <h1 className="text-3xl font-black tracking-tight text-on-surface">
            {offer.title}
          </h1>

          {/* Subtitle - vehicle reference */}
          <p className="text-on-surface-variant text-base">{offer.subtitle}</p>

          {/* Price */}
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-tertiary">
              {offer.price}
            </span>
          </div>

          {/* Includes */}
          <div className="flex items-center gap-2 text-on-surface-variant">
            <Icon name="verified" size="sm" className="text-green-600" />
            <span className="text-sm font-medium">
              Περιλαμβάνεται εργασία και επώνυμα ανταλλακτικά
            </span>
          </div>

          {/* Duration */}
          <div className="flex items-center gap-2 text-on-surface-variant">
            <Icon name="schedule" size="sm" />
            <span className="text-sm">Εκτιμώμενη διάρκεια: {offer.duration}</span>
          </div>

          {/* Details */}
          <div className="mt-6 p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Τι περιλαμβάνει
            </h3>
            <div className="space-y-2">
              {offer.details.map((detail) => (
                <div key={detail} className="flex items-center gap-3">
                  <Icon
                    name="check_circle"
                    size="sm"
                    className="text-primary shrink-0"
                  />
                  <span className="text-sm text-on-surface">{detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Bottom CTA — above BottomNav (h-20 = 80px on mobile) */}
      <div className="fixed bottom-20 md:bottom-0 inset-x-0 z-40 bg-surface/80 backdrop-blur-xl border-t border-outline-variant/20 p-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleGetOffer}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl machined-gradient text-on-primary font-bold text-base shadow-lg shadow-primary/20 active:scale-[0.97] transition-transform"
          >
            <Icon name="build" size="sm" className="text-on-primary" />
            Πάρε Προσφορά
          </button>
        </div>
      </div>
    </div>
  )
}
