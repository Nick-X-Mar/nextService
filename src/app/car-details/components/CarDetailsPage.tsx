import CarDetailsSection from './components/CarDetailsSection'
import Image from 'next/image'

export default function CarDetailsPage() {
  return (
    <div className="min-h-screen bg-surface relative overflow-hidden">
      {/* Persona — desktop: stuck to the right side of the form area */}
      <div className="hidden lg:block absolute top-1/2 -translate-y-1/2 left-1/2 pointer-events-none z-0" style={{ marginLeft: 'calc(256px + 2vw)' }}>
        <div className="w-[20vw]">
          <Image
            src="/images/persona.webp"
            alt=""
            width={600}
            height={600}
            className="select-none w-full h-auto"
            priority={false}
          />
        </div>
      </div>


      <div className="relative z-10">
        <CarDetailsSection />
      </div>
    </div>
  )
}
