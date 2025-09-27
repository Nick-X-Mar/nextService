
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
            <div className="flex justify-center">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
                    {offersData.map((offer, index) => (
                    <div key={index} className="bg-white rounded-lg shadow-md p-4">
                        <Image src={offer.image} alt={offer.title} width={300} height={160} className="w-full h-40 object-cover rounded mb-2" />
                        <h3 className={styles.cardTitle}>{offer.title}</h3>
                        <p className={styles.bodyText}>{offer.description}</p>
                        <button className={styles.btnPrimary}>Περισσότερα</button>
                    </div>
                    ))}
                </div>
            </div>
            <button className="mt-4 {styles.btnPrimary}">Όλες οι προσφορές</button>
        </div>
      </div>
    </section>
  )
}
