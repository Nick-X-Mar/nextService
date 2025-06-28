import { styles } from '../../styles/styles'

export default function FeaturesSection() {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className="text-center">
          <h2 className={styles.sectionTitle}>
            Γιατί να επιλέξετε το NextService;
          </h2>
          <p className={`mt-4 max-w-2xl mx-auto text-xl ${styles.smallText}`}>
            Προσφέρουμε την καλύτερη εμπειρία για πελάτες και επαγγελματίες
          </p>
        </div>

        <div className="mt-16">
          <div className={styles.grid3}>
            {/* Feature 1 */}
            <div className="text-center">
              <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white mx-auto">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className={`mt-4 ${styles.cardTitle}`}>Εύκολη Αναζήτηση</h3>
              <p className={`mt-2 ${styles.bodyText}`}>
                Βρείτε γρήγορα τον επαγγελματία που χρειάζεστε με τα εξελιγμένα φίλτρα μας
              </p>
            </div>

            {/* Feature 2 */}
            <div className="text-center">
              <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white mx-auto">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className={`mt-4 ${styles.cardTitle}`}>Επαληθευμένοι Επαγγελματίες</h3>
              <p className={`mt-2 ${styles.bodyText}`}>
                Όλοι οι επαγγελματίες είναι επαληθευμένοι και αξιολογημένοι από πραγματικούς πελάτες
              </p>
            </div>

            {/* Feature 3 */}
            <div className="text-center">
              <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white mx-auto">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className={`mt-4 ${styles.cardTitle}`}>Γρήγορη Επικοινωνία</h3>
              <p className={`mt-2 ${styles.bodyText}`}>
                Επικοινωνήστε άμεσα με τους επαγγελματίες και λάβετε προσφορές γρήγορα
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
} 