export default function FeaturesSection() {
  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Γιατί να επιλέξετε το NextService;
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
            Προσφέρουμε την καλύτερη εμπειρία για πελάτες και επαγγελματίες
          </p>
        </div>

        <div className="mt-16">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* Feature 1 */}
            <div className="text-center">
              <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white mx-auto">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-medium text-gray-900">Εύκολη Αναζήτηση</h3>
              <p className="mt-2 text-base text-gray-500">
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
              <h3 className="mt-4 text-lg font-medium text-gray-900">Επαληθευμένοι Επαγγελματίες</h3>
              <p className="mt-2 text-base text-gray-500">
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
              <h3 className="mt-4 text-lg font-medium text-gray-900">Γρήγορη Επικοινωνία</h3>
              <p className="mt-2 text-base text-gray-500">
                Επικοινωνήστε άμεσα με τους επαγγελματίες και λάβετε προσφορές γρήγορα
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
} 