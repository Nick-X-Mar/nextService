'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import offersData from '../../../data/offers.json'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { Badge } from '@/components/ui/badge'
import { motion, useMotionValue, useSpring } from 'motion/react'

const GAP = 24 // space-x-6 = 1.5rem = 24px

export default function OffersSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 300, damping: 30 })
  const [activeIndex, setActiveIndex] = useState(0)
  const [revealedIndex, setRevealedIndex] = useState<number | null>(null)
  const [cardW, setCardW] = useState(0)
  const [containerW, setContainerW] = useState(0)
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Calculate x offset to center a card at given index
  const getOffsetForIndex = useCallback((index: number) => {
    if (cardW <= 0 || containerW <= 0) return 0
    const cardCenter = index * (cardW + GAP) + cardW / 2
    return -(cardCenter - containerW / 2)
  }, [cardW, containerW])

  const scrollToIndex = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(offersData.length - 1, index))
    x.set(getOffsetForIndex(clamped))
    setActiveIndex(clamped)
    setRevealedIndex(null)
  }, [x, getOffsetForIndex])

  // Center first card on mount
  useEffect(() => {
    if (cardW > 0 && containerW > 0) {
      x.set(getOffsetForIndex(0))
    }
  }, [cardW, containerW, x, getOffsetForIndex])

  // Auto-reveal after 2s centered
  useEffect(() => {
    if (revealTimer.current) clearTimeout(revealTimer.current)
    revealTimer.current = setTimeout(() => {
      setRevealedIndex(activeIndex)
    }, 2000)
    return () => {
      if (revealTimer.current) clearTimeout(revealTimer.current)
    }
  }, [activeIndex])

  const handleCardClick = useCallback((index: number) => {
    if (cardW <= 0) return

    if (index === activeIndex) {
      setRevealedIndex(prev => prev === index ? null : index)
    } else {
      scrollToIndex(index)
    }
  }, [cardW, activeIndex, scrollToIndex])

  const canGoPrev = activeIndex > 0
  const canGoNext = activeIndex < offersData.length - 1

  return (
    <section className="py-14 relative overflow-hidden">
      {/* Header */}
      <div className="px-8 text-center mb-8">
        <h3 className="text-2xl md:text-3xl font-black italic tracking-tighter text-white drop-shadow-lg">
          Hot Deals
        </h3>
        <p className="text-white/70 text-sm mt-1 drop-shadow">
          Εργασία & επώνυμα ανταλλακτικά
        </p>
      </div>

      {/* Carousel with arrows */}
      <div className="relative">
        {/* Left Arrow */}
        <button
          onClick={() => canGoPrev && scrollToIndex(activeIndex - 1)}
          className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center transition-opacity ${
            canGoPrev ? 'opacity-100 hover:bg-white/25 active:scale-90' : 'opacity-30 pointer-events-none'
          }`}
        >
          <Icon name="chevron_left" size="md" className="text-white" />
        </button>

        {/* Right Arrow */}
        <button
          onClick={() => canGoNext && scrollToIndex(activeIndex + 1)}
          className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center transition-opacity ${
            canGoNext ? 'opacity-100 hover:bg-white/25 active:scale-90' : 'opacity-30 pointer-events-none'
          }`}
        >
          <Icon name="chevron_right" size="md" className="text-white" />
        </button>

        <div ref={containerRef} className="overflow-hidden">
          <motion.div
            ref={wrapRef}
            className="flex"
            style={{ x: springX, gap: GAP }}
          >
          {offersData.map((offer, index) => {
            const isRevealed = revealedIndex === index

            return (
              <div
                key={offer.id}
                className="w-[80vw] md:w-[38vw] xl:w-[28vw] shrink-0"
                onClick={() => handleCardClick(index)}
              >
                <div className="relative h-[420px] md:h-[480px] rounded-2xl overflow-hidden shadow-xl border border-white/10 bg-surface-container-lowest">
                  {/* Main content */}
                  <div className="size-full bg-gradient-to-br from-primary-container/40 via-primary-container/20 to-surface-container-lowest flex flex-col items-center justify-center gap-5 p-6 relative transition-transform duration-300">
                    {/* Icon */}
                    <div className="w-28 h-28 rounded-full bg-primary-container/25 flex items-center justify-center">
                      <span
                        className="material-symbols-outlined text-primary"
                        style={{
                          fontSize: 56,
                          fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48",
                        }}
                      >
                        {offer.icon}
                      </span>
                    </div>

                    {/* Title & Price */}
                    <h4 className="font-bold text-xl text-on-surface text-center">
                      {offer.title}
                    </h4>
                    <p className="text-on-surface-variant text-sm text-center">
                      {offer.subtitle}
                    </p>

                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-tertiary">
                        {offer.price}
                      </span>
                    </div>

                    {/* Includes note */}
                    <div className="inline-flex items-center gap-1.5 bg-surface-container-lowest/80 backdrop-blur-sm px-3 py-1.5 rounded-full">
                      <Icon name="verified" size="sm" className="text-green-600" />
                      <span className="text-xs font-bold text-on-surface-variant">
                        Εργασία & ανταλλακτικά
                      </span>
                    </div>
                  </div>

                  {/* Reveal content — controlled by state, not hover */}
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
                      href={`/offer/${offer.slug}`}
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
        {offersData.map((_, index) => (
          <button
            key={index}
            onClick={() => scrollToIndex(index)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              index === activeIndex
                ? 'bg-[#ff9900] scale-125'
                : 'bg-white/50 hover:bg-white/70'
            }`}
          />
        ))}
      </div>
    </section>
  )
}
