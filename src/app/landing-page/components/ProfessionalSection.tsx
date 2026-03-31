'use client'

import Link from 'next/link'
import Icon from '@/components/ui/Icon'

export default function ProfessionalSection() {
  return (
    <section className="px-5 mb-10">
      <div className="bg-[#FFDDC1]/30 rounded-3xl p-6 border border-primary/10">
        <div className="text-center mb-8">
          <h3 className="text-2xl font-black italic tracking-tighter text-on-surface mb-2">Είστε Επαγγελματίας;</h3>
          <p className="text-on-surface-variant text-sm px-4">Εγγραφείτε στο NextService και βρείτε νέους πελάτες για το συνεργείο σας</p>
        </div>

        <div className="space-y-4 mb-8">
          {[
            { icon: 'group_add', title: 'Νέοι Πελάτες', desc: 'Λάβετε ειδοποιήσεις για νέα αιτήματα στην περιοχή σας' },
            { icon: 'dashboard_customize', title: 'Διαχείριση Εύκολη', desc: 'Διαχειριστείτε προσφορές και ραντεβού από ένα σημείο' },
            { icon: 'psychology', title: 'Ειδικότητες', desc: 'Επιλέξτε τις ειδικότητες σας και λάβετε σχετικά αιτήματα' },
          ].map((item) => (
            <div key={item.title} className="flex items-center gap-4 bg-white/60 p-3 rounded-2xl">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Icon name={item.icon} filled />
              </div>
              <div>
                <h4 className="text-sm font-bold leading-tight">{item.title}</h4>
                <p className="text-[10px] text-on-surface-variant">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center mb-4">
            <Icon name="domain" size="lg" className="text-primary" />
          </div>
          <h4 className="font-bold text-lg mb-1">Εγγραφή Συνεργείου</h4>
          <p className="text-xs text-on-surface-variant mb-6 px-4">Εγγραφείτε τώρα και αρχίστε να λαμβάνετε νέα αιτήματα υπηρεσιών</p>
          <Link
            href="/register-professional"
            className="w-full bg-gradient-to-r from-[#d97706] to-[#ea580c] text-white py-4 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            <Icon name="add_business" />
            Εγγραφή Επαγγελματία
          </Link>
          <span className="text-[10px] font-bold text-on-surface-variant/60 mt-3 uppercase tracking-widest">Εγγραφή δωρεάν</span>
        </div>
      </div>
    </section>
  )
}
