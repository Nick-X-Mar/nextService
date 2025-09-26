
import { styles } from '../../../styles/styles'
import offersData from '../../../data/offers.json'
import Image from 'next/image'

export default function OffersSection() {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className="text-center">
        <h2 className={styles.sectionTitle}>Όλες οι προσφορές</h2>
            <p className={`mt-4 max-w-2xl mx-auto text-xl ${styles.smallText}`}>
                Βρες την προσφορά που ταιρίαζει στην ανάγκη σου
            </p>
            <div className="relative">
            <button className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-white p-2 rounded-full shadow-md">←</button>
            <div className="flex overflow-x-auto space-x-4">
                {offersData.map((offer, index) => (
                <div key={index} className="min-w-[300px] bg-white rounded-lg shadow-md p-4">
                    <Image src={offer.image} alt={offer.title} width={300} height={160} className="w-full h-40 object-cover rounded mb-2" />
                    <h3 className={styles.cardTitle}>{offer.title}</h3>
                    <p className={styles.bodyText}>{offer.description}</p>
                    <button className={styles.btnPrimary}>Περισσότερα</button>
                </div>
                ))}
            </div>
            <button className="absolute right-0 top-1/2 transform -translate-y-1/2 bg-white p-2 rounded-full shadow-md">→</button>
            </div>
            <button className="mt-4 {styles.btnPrimary}">Όλες οι προσφορές</button>
        </div>
      </div>
    </section>
  )
}
