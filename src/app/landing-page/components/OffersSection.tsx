import offersData from '../../../data/offers.json'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'

export default function OffersSection() {
  return (
    <section className="mb-12">
      <div className="px-5 flex justify-between items-end mb-6">
        <div>
          <h3 className="text-2xl font-black italic tracking-tighter">Κορυφαίες Προσφορές</h3>
          <p className="text-on-surface-variant text-sm">Οι καλύτερες τιμές της αγοράς</p>
        </div>
        <span className="text-primary text-xs font-bold uppercase tracking-wider cursor-pointer hover:underline">Δες Ολες</span>
      </div>

      <div className="flex overflow-x-auto gap-5 px-5 no-scrollbar snap-x">
        {offersData.map((offer, index) => (
          <div key={index} className="min-w-[280px] snap-center bg-surface-container-lowest rounded-xl p-4 shadow-sm relative overflow-hidden">
            {offer.discount && (
              <div className="absolute top-0 right-0 px-3 py-1 bg-tertiary text-white text-[10px] font-black rounded-bl-lg z-10">
                {offer.discount}
              </div>
            )}
            <div className="aspect-video rounded-lg overflow-hidden mb-4 bg-surface-container">
              {offer.image && !offer.image.startsWith('/path') && (
                <Image
                  src={offer.image}
                  alt={offer.title}
                  width={300}
                  height={170}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <h4 className="font-bold text-lg mb-1">{offer.title}</h4>
            <p className="text-on-surface-variant text-xs mb-4 line-clamp-2">{offer.description}</p>
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-tertiary text-2xl font-black">{offer.price}</span>
                {offer.originalPrice && (
                  <span className="text-on-surface-variant text-[10px] line-through">{offer.originalPrice}</span>
                )}
              </div>
              <button className="bg-surface-container text-on-surface p-2 rounded-lg active:scale-90 transition-transform">
                <Icon name="chevron_right" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
