'use client'

import Link from 'next/link'
import { HiBuildingOffice2, HiWrenchScrewdriver, HiChartBar, HiUsers } from 'react-icons/hi2'
import { styles } from '../../../styles/styles'

export default function ProfessionalSection() {
  return (
    <section className="bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className={styles.container}>
        <div className="py-16">
          <div className="text-center mb-12">
            <h2 className={styles.sectionTitle}>
              Είστε Επαγγελματίας;
            </h2>
            <p className={`mt-4 max-w-2xl mx-auto text-xl ${styles.bodyText}`}>
              Εγγραφείτε στο NextService και βρείτε νέους πελάτες για το συνεργείο σας
            </p>
          </div>

          <div className={styles.grid3}>
            {/* Benefits for Professionals */}
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-500 text-white">
                    <HiUsers className="h-5 w-5" />
                  </div>
                </div>
                <div>
                  <h3 className={`${styles.cardTitle} mb-2`}>Νέοι Πελάτες</h3>
                  <p className={styles.bodyText}>
                    Λάβετε ειδοποιήσεις για νέα αιτήματα υπηρεσιών στην περιοχή σας
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-500 text-white">
                    <HiChartBar className="h-5 w-5" />
                  </div>
                </div>
                <div>
                  <h3 className={`${styles.cardTitle} mb-2`}>Διαχείριση Εύκολη</h3>
                  <p className={styles.bodyText}>
                    Διαχειριστείτε τις προσφορές σας και τα ραντεβού από ένα σημείο
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-500 text-white">
                    <HiWrenchScrewdriver className="h-5 w-5" />
                  </div>
                </div>
                <div>
                  <h3 className={`${styles.cardTitle} mb-2`}>Ειδικότητες</h3>
                  <p className={styles.bodyText}>
                    Επιλέξτε τις ειδικότητές σας και λάβετε μόνο σχετικά αιτήματα
                  </p>
                </div>
              </div>
            </div>

            {/* CTA Section */}
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-6">
                  <HiBuildingOffice2 className="h-8 w-8 text-blue-600" />
                </div>
                
                <h3 className={`${styles.cardTitle} mb-4`}>
                  Εγγραφή Συνεργείου
                </h3>
                
                <p className={`${styles.bodyText} mb-6`}>
                  Εγγραφείτε τώρα και αρχίστε να λαμβάνετε νέα αιτήματα υπηρεσιών
                </p>
                
                <Link 
                  href="/register-professional"
                  className={`${styles.btnPrimary} inline-flex items-center justify-center px-6 py-3 text-base font-medium`}
                >
                  <HiBuildingOffice2 className="h-5 w-5 mr-2" />
                  Εγγραφή Επαγγελματία
                </Link>
                
                <p className={`${styles.smallText} mt-4 text-gray-500`}>
                  Εγγραφή δωρεάν
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
