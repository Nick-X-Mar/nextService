import HeroSection from './components/HeroSection'
import OffersSection from './components/OffersSection'

export default function LandingPage() {
  return (
    <div className="relative landing-page overflow-x-hidden">
      {/* Single fixed background image for the entire page */}
      <div className="fixed inset-0 -z-10">
        <picture>
          <source media="(max-width: 767px)" srcSet="/road_mobile.webp" type="image/webp" />
          <source media="(max-width: 767px)" srcSet="/road_mobile.jpg" type="image/jpeg" />
          <source media="(min-width: 768px)" srcSet="/road_desktop.webp" type="image/webp" />
          <img
            src="/road_desktop.jpg"
            alt=""
            className="w-full h-full object-cover"
          />
        </picture>
        {/* Dark overlay across entire background */}
        <div className="absolute inset-0 bg-black/30" />
      </div>
      <HeroSection />
      <OffersSection />
    </div>
  )
}
