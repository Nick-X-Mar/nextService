import HeroSection from './components/HeroSection'
import FeaturesSection from './components/FeaturesSection'
import { styles } from '../../styles/styles'

export default function LandingPage() {
  return (
    <div className={styles.pageWrapper}>
      <HeroSection />
      <FeaturesSection />
    </div>
  )
} 