import HeroSection from './components/HeroSection'
import OffersSection from './components/OffersSection'
import FAQSection from './components/FAQSection'

export default function LandingPage() {
  return (
    <div className="relative landing-page overflow-x-hidden">
      {/* Single fixed background image for the entire page */}
      <div className="fixed inset-0 -z-10">
        <picture>
          <source media="(max-width: 767px)" srcSet="/road_mobile.webp" type="image/webp" />
          <img
            src="/road_desktop.webp"
            alt=""
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
