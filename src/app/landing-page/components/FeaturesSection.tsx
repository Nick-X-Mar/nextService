import { styles } from '../../../styles/styles'
import Icon from '@/components/ui/Icon'

export default function FeaturesSection() {
  const features = [
    { icon: 'search', title: 'Εύκολη Αναζήτηση', description: 'Βρείτε γρήγορα τον επαγγελματία που χρειάζεστε' },
    { icon: 'verified', title: 'Επαληθευμένοι Επαγγελματίες', description: 'Όλοι οι επαγγελματίες είναι επαληθευμένοι και αξιολογημένοι από πραγματικούς πελάτες' },
    { icon: 'bolt', title: 'Γρήγορη Επικοινωνία', description: 'Επικοινωνήστε άμεσα με τους επαγγελματίες και λάβετε προσφορές γρήγορα' },
  ]

  return (
    <section className="py-12 bg-surface-container-low">
      <div className={styles.container}>
        <div className="text-center mb-10">
          <h2 className={styles.sectionTitle}>
            Γιατί να επιλέξετε το <span className="text-primary">NextService</span>;
          </h2>
          <p className="mt-3 max-w-2xl mx-auto text-secondary">
            Προσφέρουμε την καλύτερη εμπειρία για πελάτες και επαγγελματίες
          </p>
        </div>

        <div className={styles.grid3}>
          {features.map((feature) => (
            <div key={feature.title} className="text-center">
              <div className={styles.featureIcon + ' mx-auto'}>
                <Icon name={feature.icon} size="lg" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-on-surface">{feature.title}</h3>
              <p className="mt-2 text-secondary text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
