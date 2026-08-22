'use client'

import React, { useState, useLayoutEffect, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { gsap } from 'gsap'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useNavigation } from '@/hooks/useNavigation'
import { saveFormData } from '@/utils/formStorage'

const categories = [
  { icon: 'settings', label: 'Συμπλέκτης (Δίσκος-πλατό)', value: 'symplektis' },
  { icon: 'conveyor_belt', label: 'Ιμάντας', value: 'imantas' },
  { icon: 'format_paint', label: 'Ολική Βαφή', value: 'oliki-vafi' },
  { icon: 'brush', label: 'Μερική Βαφή', value: 'meriki-vafi' },
  { icon: 'sensors', label: 'Αισθητήρες', value: 'aisthitires' },
  { icon: 'oil_barrel', label: 'Αλλαγή λαδιών', value: 'allagi-ladion' },
]

export default function HeroSection() {
  const { navigate } = useNavigation()
  const searchParams = useSearchParams()
  const [selectedCategory, setSelectedCategory] = useState('')
  // The category tap fires a 500ms close animation before the push, so without
  // this the row sits there looking inert for the whole wait.
  const [pendingCategory, setPendingCategory] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<HTMLDivElement[]>([])
  const tlRef = useRef<gsap.core.Timeline | null>(null)

  const selectedLabel = categories.find(c => c.value === selectedCategory)?.label || ''

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(itemsRef.current, { y: 30, opacity: 0 })
      const tl = gsap.timeline({ paused: true })
      tl.to(containerRef.current, { height: 380, duration: 0.4, ease: 'power3.out' })
        .to(itemsRef.current, { y: 0, opacity: 1, duration: 0.3, ease: 'power3.out', stagger: 0.06 }, '-=0.2')
      tlRef.current = tl
    }, containerRef)
    return () => ctx.revert()
  }, [])

  // Auto-open when navigated with ?open=1
  useEffect(() => {
    if (searchParams.get('open') === '1' && tlRef.current && !isOpen) {
      setTimeout(() => {
        tlRef.current?.play()
        setIsOpen(true)
      }, 300)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const toggleMenu = () => {
    if (!tlRef.current) return
    if (isOpen) {
      tlRef.current.reverse()
    } else {
      tlRef.current.play()
    }
    setIsOpen(!isOpen)
  }

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const selectCategory = (value: string) => {
    if (pendingCategory) return
    setSelectedCategory(value)
    setPendingCategory(value)
    if (tlRef.current) tlRef.current.reverse()
    setIsOpen(false)
    saveFormData({ category: value })
    const clientId = localStorage.getItem('clientId')
    fetch('/api/track/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'category_selected', clientId, metadata: { category: value } }),
    }).catch(() => {})
    setTimeout(() => {
      navigate('/car-details/')
    }, 500)
  }

  return (
    <section className="relative min-h-screen flex flex-col justify-center">
      {/* Overlay removed — now applied globally in LandingPage */}

      <h1 className="sr-only">
        NextService — Βρες συνεργείο αυτοκινήτου στην Ελλάδα και πάρε προσφορές από επαγγελματίες για service, συμπλέκτη, ιμάντα χρονισμού και φανοποιεία
      </h1>

      {/* Content */}
      <div className="relative z-10 px-5 flex flex-col items-center">
        {/* Animated Command Menu */}
        <div
          ref={containerRef}
          className="w-full max-w-[480px] h-[60px] bg-surface-container-lowest/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-outline-variant/10 overflow-hidden"
        >
          {/* Search Bar */}
          <div className="absolute inset-x-0 top-0 h-[60px] flex items-center justify-between px-4 z-10">
            <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => !isOpen && toggleMenu()}>
              <Icon name="search" size="md" className="text-on-surface-variant/50" />
              {selectedCategory ? (
                <span className="text-sm font-bold text-on-surface">{selectedLabel}</span>
              ) : (
                <span className="text-sm text-on-surface-variant/50">Τι χρειάζεται το αυτοκίνητό σου;</span>
              )}
            </div>
            <button
              onClick={toggleMenu}
              className="text-xs font-bold text-on-surface-variant bg-surface-container-high px-3 py-1.5 rounded-lg"
            >
              {isOpen ? 'Κλείσιμο' : 'Άνοιγμα'}
            </button>
          </div>

          {/* Dropdown Items */}
          <div className="absolute inset-x-0 top-[60px] p-2 space-y-1">
            {categories.map((cat, i) => (
              <div
                key={cat.value}
                ref={el => { itemsRef.current[i] = el! }}
                onClick={() => selectCategory(cat.value)}
                className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                  selectedCategory === cat.value
                    ? 'bg-primary/10'
                    : 'bg-surface-container hover:bg-surface-container-high'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    name={cat.icon}
                    size="sm"
                    className={selectedCategory === cat.value ? 'text-primary' : 'text-on-surface-variant/60'}
                  />
                  <span className={`text-sm font-bold ${
                    selectedCategory === cat.value ? 'text-primary' : 'text-on-surface'
                  }`}>
                    {cat.label}
                  </span>
                </div>
                {pendingCategory === cat.value ? (
                  <Spinner size="sm" className="text-primary" />
                ) : (
                  <Icon
                    name="arrow_forward"
                    size="sm"
                    className={selectedCategory === cat.value ? 'text-primary' : 'text-on-surface-variant/30'}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Scroll cue — the only signal that the completed-jobs carousel and the FAQ
          exist below the fold. Sits above BottomNav on mobile, and fades out while
          the category menu is open so it never collides with it on short screens. */}
      <div
        className={`absolute bottom-32 md:bottom-16 inset-x-0 z-10 flex flex-col items-center gap-2 transition-opacity duration-300 ${
          isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="flex flex-wrap items-center justify-center gap-2 px-4">
          <button
            type="button"
            onClick={() => scrollTo('offers')}
            className="flex items-center gap-1.5 md:gap-2 rounded-full bg-black/45 hover:bg-black/60 backdrop-blur-md border border-white/25 px-3 md:px-4 py-2.5 shadow-lg active:scale-95 transition-all"
          >
            <Icon name="receipt_long" size="sm" className="text-primary-container" />
            <span className="text-xs md:text-sm font-bold text-white whitespace-nowrap">
              Ολοκληρωμένες εργασίες
            </span>
          </button>
          <button
            type="button"
            onClick={() => scrollTo('faq')}
            className="flex items-center gap-1.5 md:gap-2 rounded-full bg-black/45 hover:bg-black/60 backdrop-blur-md border border-white/25 px-3 md:px-4 py-2.5 shadow-lg active:scale-95 transition-all"
          >
            <Icon name="help" size="sm" className="text-primary-container" />
            <span className="text-xs md:text-sm font-bold text-white whitespace-nowrap">
              {/* The full label doesn't fit beside the offers pill on a phone row */}
              <span className="md:hidden">Ερωτήσεις</span>
              <span className="hidden md:inline">Συχνές ερωτήσεις</span>
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => scrollTo('offers')}
          aria-label="Δες τι υπάρχει πιο κάτω"
          className="w-20 h-10 rounded-full machined-gradient shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
        >
          {/* The chevron bounces, not the button — a moving hit area makes the
              tap easy to miss on a phone. */}
          <Icon name="keyboard_arrow_down" size="lg" className="text-on-primary animate-bounce" />
        </button>
      </div>
    </section>
  )
}
