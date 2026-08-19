'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { Badge } from '@/components/ui/badge'
import { useNavigation } from '@/hooks/useNavigation'
import { saveFormData } from '@/utils/formStorage'

interface Offer {
  id?: string
  dealId?: string
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

interface OfferDetailPageProps {
  slug: string
  initialOffer: Offer | null
}

export default function OfferDetailPage({ initialOffer }: OfferDetailPageProps) {
  const router = useRouter()
  const { navigate, isNavigating } = useNavigation()
  const [offer] = useState<Offer | null>(initialOffer)
  const [shared, setShared] = useState(false)

  const handleGetOffer = useCallback(() => {
    if (!offer) return
    saveFormData({
      category: offer.category,
      description: offer.workType,
    })
    navigate('/car-details/')
  }, [offer, navigate])

  const handleShare = useCallback(async () => {
    if (!offer) return
    const url = `${window.location.origin}/offer/${offer.slug}`
    const shareData = {
      title: `${offer.title} - ${offer.price} | NextService`,
      text: `${offer.title} σε ${offer.subtitle}: ${offer.price}. Πραγματική τιμή από εργασία που έγινε μέσω NextService.`,
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

  if (!offer) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4">
        <Icon name="search_off" size="lg" className="text-on-surface-variant/30" />
        <p className="text-on-surface-variant">Η εργασία δεν βρέθηκε</p>
        <button
          onClick={() => router.push('/')}
          className="text-primary font-bold text-sm"
        >
          Επιστροφή στην αρχική
        </button>
      </div>
    )
  }

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
          <div className="relative mt-4 aspect-[16/10] w-full overflow-hidden rounded-2xl bg-surface-container-high">
            <Image
              src={offer.image}
              alt={offer.title}
              fill
              sizes="(max-width: 768px) 100vw, 672px"
              className="object-cover"
              priority
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
          {/* Category + what this listing actually is */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-primary-container/30 text-primary border-primary/20 text-xs font-bold uppercase tracking-wider">
              {offer.category === 'fanopeia' ? 'Φανοποιεία' : 'Service'}
            </Badge>
            <Badge className="rounded-full bg-surface-container-high text-on-surface-variant border-outline-variant/20 text-xs font-bold uppercase tracking-wider">
              Ολοκληρωμένη εργασία
            </Badge>
          </div>

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

          {/* The price is a past fact, not an offer — say so right under it,
              before the visitor reads it as a price list. */}
          <div className="flex items-start gap-2 rounded-xl bg-surface-container-low p-3">
            <Icon
              name="info"
              size="sm"
              className="text-on-surface-variant mt-0.5 shrink-0"
            />
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Είναι η τιμή που δόθηκε για το συγκεκριμένο αυτοκίνητο, όχι σταθερό
              πακέτο. Για το δικό σου όχημα μπορεί να διαφέρει — στείλε αίτημα για
              τη δική σου προσφορά.
            </p>
          </div>

          {/* Includes */}
          <div className="flex items-center gap-2 text-on-surface-variant">
            <Icon name="verified" size="sm" className="text-green-600" />
            <span className="text-sm font-medium">
              Περιλάμβανε εργασία και επώνυμα ανταλλακτικά
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
              Τι περιλάμβανε η εργασία
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
            disabled={isNavigating('/car-details/')}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl machined-gradient text-on-primary font-bold text-base shadow-lg shadow-primary/20 active:scale-[0.97] transition-transform disabled:opacity-70"
          >
            {isNavigating('/car-details/')
              ? <Spinner size="sm" className="text-on-primary" />
              : <Icon name="build" size="sm" className="text-on-primary" />}
            Πάρε Προσφορά
          </button>
        </div>
      </div>
    </div>
  )
}
