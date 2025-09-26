import HeroSection from './components/HeroSection'
import FeaturesSection from './components/FeaturesSection'
import OffersSection from './components/OffersSection'
import { styles } from '../../styles/styles'

export default function LandingPage() {
  return (
    <div className={styles.pageWrapper}>
      <HeroSection />
      <OffersSection />
      <FeaturesSection />
    </div>
  )
} 