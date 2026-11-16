import HeroSection from './components/HeroSection'
import OffersSection from './components/OffersSection'
import FAQSection from './components/FAQSection'

export default function LandingPage() {
  return (
    <div className="relative landing-page overflow-x-hidden">
      {/* Single fixed background image for the entire page */}
      <div className="fixed inset-0 -z-10">
        {/* Encoded at the size each screen shows (720px wide on a phone), AVIF
            first: 71 KB on a phone where the old WebP was 330 KB. A new picture
            gets a new file name (see CLAUDE.md on image caching). */}
        <picture>
          <source media="(max-width: 767px)" srcSet="/images/home/road-mobile.avif" type="image/avif" />
          <source media="(max-width: 767px)" srcSet="/images/home/road-mobile.webp" type="image/webp" />
          <source srcSet="/images/home/road-desktop.avif" type="image/avif" />
          {/* The homepage's largest paint: fetched first, ahead of the scripts. */}
          <img
            src="/images/home/road-desktop.webp"
            alt=""
            fetchPriority="high"
            className="w-full h-full object-cover"
          />
        </picture>
        {/* Dark overlay across entire background */}
        <div className="absolute inset-0 bg-black/30" />
      </div>
      {/* Server-rendered: its useSearchParams sits behind a boundary of its
          own inside HeroSection, so the h1 and the categories are in the HTML. */}
      <HeroSection />
      <OffersSection />
      <FAQSection />
    </div>
  )
}
