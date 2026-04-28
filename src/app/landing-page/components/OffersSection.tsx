'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import staticOffers from '../../../data/offers.json'
import Link from 'next/link'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import { Badge } from '@/components/ui/badge'
import { motion, useMotionValue, useSpring } from 'motion/react'

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
  popular: boolean
}

const GAP = 24

export default function OffersSection() {
  const [offers, setOffers] = useState<Offer[]>(staticOffers)
  const N = offers.length
  const extendedOffers = [...offers, ...offers, ...offers]

  const containerRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 300, damping: 30 })
  const physicalRef = useRef(N)
  const [activePhysical, setActivePhysical] = useState(N)
  const [revealedIndex, setRevealedIndex] = useState<number | null>(null)
  const [cardW, setCardW] = useState(0)
  const [containerW, setContainerW] = useState(0)
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recenterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const logicalIndex = ((activePhysical % N) + N) % N

  // Fetch deals from DB (falls back to static JSON on error)
  useEffect(() => {
    async function fetchDeals() {
      try {
        const res = await fetch('/api/hot-deals')
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) {
            setOffers(data.map((d: Offer) => ({ ...d, id: d.dealId || d.id })))
            physicalRef.current = data.length
            setActivePhysical(data.length)
          }
        }
      } catch { /* keep static fallback */ }
    }
    fetchDeals()
  }, [])

  useEffect(() => {
    const measure = () => {
      if (!containerRef.current || !wrapRef.current) return
      setContainerW(containerRef.current.offsetWidth)
      const firstCard = wrapRef.current.children[0] as HTMLElement
      if (firstCard) setCardW(firstCard.offsetWidth)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const getOffsetForIndex = useCallback((index: number) => {
    if (cardW <= 0 || containerW <= 0) return 0
    const cardCenter = index * (cardW + GAP) + cardW / 2
    return -(cardCenter - containerW / 2)
  }, [cardW, containerW])

  // Silently re-center to the middle copy (same visual position, different physical index)
  const recenter = useCallback(() => {
    const current = physicalRef.current
    if (current >= N && current < 2 * N) return // already in middle copy

    const equivalent = N + (((current % N) + N) % N)
    // Jump spring instantly — visually identical since edge copy = middle copy
    springX.jump(getOffsetForIndex(equivalent))
    x.set(getOffsetForIndex(equivalent))
    physicalRef.current = equivalent
    setActivePhysical(equivalent)
  }, [x, springX, getOffsetForIndex, N])

  // Animate to a physical index, then schedule re-center after spring settles
  const animateTo = useCallback((index: number) => {
    physicalRef.current = index
    setActivePhysical(index)
    setRevealedIndex(null)
    x.set(getOffsetForIndex(index))

    // Schedule re-center after spring settles (~400ms for this stiffness/damping)
    if (recenterTimer.current) clearTimeout(recenterTimer.current)
    recenterTimer.current = setTimeout(recenter, 500)
  }, [x, getOffsetForIndex, recenter])

  // Navigate by +1/-1 — always works, no boundaries
  const navigate = useCallback((delta: number) => {
    animateTo(physicalRef.current + delta)
  }, [animateTo])

  const scrollToLogical = useCallback((logical: number) => {
    // Find the shortest path from current position to target logical index
    const currentLogical = ((physicalRef.current % N) + N) % N
    let diff = logical - currentLogical
    // Shortest wrap: if diff > N/2, go the other way
    if (diff > N / 2) diff -= N
    if (diff < -N / 2) diff += N
    animateTo(physicalRef.current + diff)
  }, [animateTo, N])

  // Center first card on mount
  useEffect(() => {
    if (cardW > 0 && containerW > 0) {
      springX.jump(getOffsetForIndex(N))
      x.set(getOffsetForIndex(N))
    }
  }, [cardW, containerW, x, springX, getOffsetForIndex, N])

  // Auto-reveal after 2s centered
  useEffect(() => {
    if (revealTimer.current) clearTimeout(revealTimer.current)
    revealTimer.current = setTimeout(() => {
      setRevealedIndex(activePhysical)
    }, 2000)
    return () => {
      if (revealTimer.current) clearTimeout(revealTimer.current)
    }
  }, [activePhysical])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (recenterTimer.current) clearTimeout(recenterTimer.current)
    }
  }, [])

  const handleCardClick = useCallback((extIndex: number) => {
    if (cardW <= 0) return

    if (extIndex === physicalRef.current) {
      setRevealedIndex(prev => prev === extIndex ? null : extIndex)
    } else {
      const diff = extIndex - physicalRef.current
      if (Math.abs(diff) <= 2) {
        animateTo(extIndex)
      } else {
        navigate(diff > 0 ? 1 : -1)
      }
    }
  }, [cardW, animateTo, navigate])

  return (
    <section className="py-14 relative overflow-hidden">
      {/* Header */}
      <div className="px-8 text-center mb-8">
        <h2 className="text-2xl md:text-3xl font-black italic tracking-tighter text-white drop-shadow-lg">
          Hot Deals
        </h2>
        <p className="text-white/70 text-sm mt-1 drop-shadow">
          Εργασία & επώνυμα ανταλλακτικά
        </p>
      </div>

      {/* Carousel with arrows */}
      <div className="relative">
        {/* Left Arrow */}
        <button
          onClick={() => navigate(-1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center opacity-100 hover:bg-white/25 active:scale-90 transition-opacity"
        >
          <Icon name="chevron_left" size="md" className="text-white" />
        </button>

        {/* Right Arrow */}
        <button
          onClick={() => navigate(1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center opacity-100 hover:bg-white/25 active:scale-90 transition-opacity"
        >
          <Icon name="chevron_right" size="md" className="text-white" />
        </button>

        <div ref={containerRef} className="overflow-hidden">
          <motion.div
            ref={wrapRef}
            className="flex"
            style={{ x: springX, gap: GAP }}
          >
          {extendedOffers.map((offer, extIndex) => {
            const isRevealed = revealedIndex === extIndex

            return (
              <div
                key={`${offer.id}-${extIndex}`}
                className="w-[80vw] md:w-[38vw] xl:w-[28vw] shrink-0"
                onClick={() => handleCardClick(extIndex)}
              >
                <div className="relative h-[420px] md:h-[480px] rounded-2xl overflow-hidden shadow-xl border border-white/10 bg-surface-container-lowest">
                  {/* Main content */}
                  <div className="size-full relative transition-transform duration-300">
                    {/* Background image */}
                    {offer.image ? (
                      <Image
                        src={offer.image}
                        alt={offer.title}
                        fill
                        sizes="(max-width: 768px) 80vw, (max-width: 1280px) 38vw, 28vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-primary-container/40 via-primary-container/20 to-surface-container-lowest flex items-center justify-center">
                        <span
                          className="material-symbols-outlined text-primary/40"
                          style={{
                            fontSize: 80,
                            fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48",
                          }}
                        >
                          {offer.icon}
                        </span>
                      </div>
                    )}

                    {/* Gradient overlay for text readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                    {/* Text content over image */}
                    <div className={`absolute inset-0 flex flex-col items-center justify-end gap-3 p-6 pb-8 transition-all duration-500 ease-out ${
                      isRevealed ? '-translate-y-[45%]' : 'translate-y-0'
                    }`}>
                      <h4 className="font-bold text-xl text-white text-center drop-shadow-lg">
                        {offer.title}
                      </h4>
                      <p className="text-white/80 text-sm text-center drop-shadow">
                        {offer.subtitle}
                      </p>

                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-tertiary drop-shadow-lg">
                          {offer.price}
                        </span>
                      </div>

                      {/* Includes note */}
                      <div className="inline-flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">
                        <Icon name="verified" size="sm" className="text-green-600" />
                        <span className="text-xs font-bold text-white/90">
                          Εργασία & ανταλλακτικά
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Reveal content */}
                  <div
                    className={`absolute inset-[auto_1rem_1rem] p-5 rounded-2xl bg-black/60 backdrop-blur-xl transition-all duration-500 ease-out space-y-4 ${
                      isRevealed
                        ? 'translate-y-0 opacity-100'
                        : 'translate-y-[120%] opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white/70">
                        Τι περιλαμβάνει
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {offer.details.map((detail) => (
                          <Badge
                            key={detail}
                            className="rounded-full bg-white/15 text-white border-white/10 text-xs"
                          >
                            {detail}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <span className="text-sm font-bold text-green-400 block">
                      <Icon name="schedule" size="sm" className="text-green-400 inline mr-1" />
                      {offer.duration}
                    </span>

                    <Link
                      href={`/offer/${offer.slug}/`}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl machined-gradient text-on-primary font-bold text-sm shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                    >
                      <Icon name="build" size="sm" className="text-on-primary" />
                      Δες Προσφορά
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </motion.div>
        </div>
      </div>

      {/* Bullets */}
      <div className="flex justify-center gap-2 mt-6">
        {offers.map((_, index) => (
          <button
            key={index}
            onClick={() => scrollToLogical(index)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              index === logicalIndex
                ? 'bg-[#ff9900] scale-125'
                : 'bg-white/50 hover:bg-white/70'
            }`}
          />
        ))}
      </div>
    </section>
  )
}
