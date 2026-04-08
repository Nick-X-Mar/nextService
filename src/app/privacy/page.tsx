import Link from 'next/link'

export const metadata = {
  title: 'Πολιτική Απορρήτου - NextService',
  description: 'Πώς το NextService συλλέγει, χρησιμοποιεί και προστατεύει τα προσωπικά σας δεδομένα.'
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-surface px-4 py-10">
      <div className="max-w-3xl mx-auto bg-surface-container-lowest rounded-2xl p-8 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-8">
          <p className="text-sm font-bold text-amber-900 mb-1">⚠️ ΠΡΟΣΧΕΔΙΟ — Δεν είναι το τελικό κείμενο</p>
          <p className="text-sm text-amber-800">
            Αυτή η Πολιτική Απορρήτου είναι placeholder. Πριν τη δημόσια έναρξη της υπηρεσίας θα αντικατασταθεί από τελικό κείμενο που θα εκπονηθεί από νομικό σύμβουλο.
          </p>
        </div>

        <h1 className="text-3xl font-black tracking-tight text-on-surface mb-2">Πολιτική Απορρήτου</h1>
        <p className="text-sm text-on-surface-variant mb-8">Έκδοση: 1.0 — Τελευταία ενημέρωση: {new Date().toLocaleDateString('el-GR')}</p>

        <section className="space-y-6 text-sm leading-relaxed text-on-surface">
          <div>
            <h2 className="text-lg font-bold mb-2">1. Ποιοι είμαστε</h2>
            <p>
              Το NextService είναι πλατφόρμα που συνδέει ιδιοκτήτες οχημάτων με συνεργεία αυτοκινήτων στην Ελλάδα. Υπεύθυνος επεξεργασίας των δεδομένων σας είναι η εταιρεία [ΟΝΟΜΑ ΕΤΑΙΡΕΙΑΣ], με ΑΦΜ [ΑΦΜ], έδρα [ΔΙΕΥΘΥΝΣΗ]. Στοιχεία επικοινωνίας: info@nextservice.gr
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">2. Τι δεδομένα συλλέγουμε</h2>
            <p className="mb-2"><strong>Από πελάτες (ιδιοκτήτες οχημάτων):</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Στοιχεία λογαριασμού: email, κωδικός (κρυπτογραφημένος)</li>
              <li>Στοιχεία επικοινωνίας: όνομα, επώνυμο, κινητό, διεύθυνση</li>
              <li>Στοιχεία οχήματος: μάρκα, μοντέλο, έτος, αριθμός πλαισίου (VIN), αριθμός κινητήρα, πινακίδα κυκλοφορίας, χρώμα</li>
              <li>Αιτήματα service: περιγραφή προβλήματος, φωτογραφίες ζημιάς (αν προσκομίσετε)</li>
              <li>Συνομιλίες με συνεργεία μέσω της πλατφόρμας</li>
              <li>Διαθεσιμότητα και ραντεβού</li>
            </ul>
            <p className="mt-3 mb-2"><strong>Από συνεργεία:</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Επωνυμία εταιρείας, ΑΦΜ, ΔΟΥ</li>
              <li>Στοιχεία υπεύθυνου επικοινωνίας</li>
              <li>Email, κινητό, διεύθυνση</li>
              <li>Προσφορές που στέλνουν στους πελάτες</li>
            </ul>
            <p className="mt-3 mb-2"><strong>Τεχνικά δεδομένα (αυτόματη συλλογή):</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Καταγραφή ενεργειών (timestamps) για ασφάλεια και ανάλυση χρήσης</li>
              <li>Καταγραφή των emails που στέλνουμε για παρακολούθηση παράδοσης</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">3. Γιατί τα συλλέγουμε (νομική βάση)</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Εκτέλεση σύμβασης</strong> (Άρθρο 6.1.β GDPR): για να σας παρέχουμε την υπηρεσία — δηλαδή να συνδέσουμε αιτήματα service με συνεργεία και να επιτρέψουμε επικοινωνία.</li>
              <li><strong>Συγκατάθεση</strong> (Άρθρο 6.1.α GDPR): για προαιρετικές υπηρεσίες όπως ενημερωτικά μηνύματα ή marketing communications.</li>
              <li><strong>Νόμιμο συμφέρον</strong> (Άρθρο 6.1.στ GDPR): για ασφάλεια του συστήματος, πρόληψη απάτης, και βελτίωση της υπηρεσίας.</li>
              <li><strong>Νομική υποχρέωση</strong> (Άρθρο 6.1.γ GDPR): για φορολογικές και λογιστικές υποχρεώσεις (στοιχεία τιμολόγησης συνεργείων).</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">4. Με ποιους μοιραζόμαστε τα δεδομένα σας</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Συνεργεία:</strong> Όταν δημοσιεύετε αίτημα service, τα στοιχεία του οχήματος και η περιγραφή του προβλήματος γίνονται διαθέσιμα σε εγγεγραμμένα συνεργεία στην περιοχή σας. Τα προσωπικά σας στοιχεία επικοινωνίας (κινητό, διεύθυνση) μοιράζονται μόνο όταν αποδεχτείτε προσφορά.</li>
              <li><strong>Πάροχοι υποδομής:</strong> Χρησιμοποιούμε την Amazon Web Services (AWS) με data centers στη Φρανκφούρτη (eu-central-1) για αποθήκευση και επεξεργασία. Τα δεδομένα παραμένουν εντός ΕΕ.</li>
              <li><strong>Πάροχοι email/SMS:</strong> AWS SES για αποστολή email. Όταν προστεθεί SMS, ο πάροχος (πιθανώς Twilio) θα είναι μεταξύ ΕΕ ή θα έχει υπογράψει SCCs.</li>
              <li><strong>Δημόσιες αρχές:</strong> Μόνο όταν απαιτείται από τον νόμο.</li>
            </ul>
            <p className="mt-2">
              <strong>Δεν πουλάμε ποτέ</strong> τα προσωπικά σας δεδομένα σε τρίτους.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">5. Πόσο καιρό κρατάμε τα δεδομένα σας</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Στοιχεία λογαριασμού: όσο διαρκεί ο λογαριασμός σας. Διαγράφονται όταν ζητήσετε διαγραφή λογαριασμού.</li>
              <li>Αρχεία ενεργειών (event logs): 12 μήνες</li>
              <li>Αρχεία emails: 6 μήνες</li>
              <li>Ολοκληρωμένα αιτήματα service: 24 μήνες</li>
              <li>Λογιστικά παραστατικά: 10 χρόνια (νομική υποχρέωση)</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">6. Τα δικαιώματά σας</h2>
            <p className="mb-2">Σύμφωνα με τον GDPR, έχετε τα εξής δικαιώματα:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Πρόσβαση:</strong> Να μάθετε ποια δεδομένα έχουμε για εσάς.</li>
              <li><strong>Διόρθωση:</strong> Να ζητήσετε διόρθωση ανακριβών στοιχείων.</li>
              <li><strong>Διαγραφή:</strong> Να ζητήσετε διαγραφή του λογαριασμού σας και των δεδομένων σας ("δικαίωμα στη λήθη"). Αυτό μπορείτε να το κάνετε άμεσα από το προφίλ σας.</li>
              <li><strong>Φορητότητα:</strong> Να λάβετε αντίγραφο των δεδομένων σας σε δομημένη μορφή (JSON). Διαθέσιμη και αυτή από το προφίλ σας.</li>
              <li><strong>Περιορισμός επεξεργασίας:</strong> Σε ορισμένες περιπτώσεις.</li>
              <li><strong>Εναντίωση:</strong> Στην επεξεργασία βάσει νόμιμου συμφέροντος ή για marketing.</li>
              <li><strong>Ανάκληση συγκατάθεσης:</strong> Όπου η επεξεργασία βασίζεται σε συγκατάθεση.</li>
            </ul>
            <p className="mt-2">
              Για άσκηση οποιουδήποτε από αυτά τα δικαιώματα: στείλτε email στο <a href="mailto:privacy@nextservice.gr" className="text-primary underline">privacy@nextservice.gr</a>
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">7. Ασφάλεια</h2>
            <p>
              Λαμβάνουμε τα ακόλουθα μέτρα ασφαλείας:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-1">
              <li>Κωδικοί κρυπτογραφημένοι με bcrypt</li>
              <li>HTTPS σε όλη την επικοινωνία</li>
              <li>Αποθήκευση σε AWS με encryption at rest</li>
              <li>Έλεγχος πρόσβασης βάσει ρόλων (clients vs garages)</li>
              <li>Καταγραφή ευαίσθητων ενεργειών (audit log)</li>
              <li>Rate limiting και προστασία από brute force</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">8. Cookies</h2>
            <p>
              Χρησιμοποιούμε μόνο τεχνικά απαραίτητα cookies (session, login state). Δεν χρησιμοποιούμε cookies παρακολούθησης ή διαφημιστικά cookies. Αν αυτό αλλάξει στο μέλλον, θα εμφανιστεί cookie banner ζητώντας τη ρητή σας συγκατάθεση.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">9. Παράπονα</h2>
            <p>
              Αν θεωρείτε ότι παραβιάζουμε τον GDPR, έχετε δικαίωμα να υποβάλετε καταγγελία στην <strong>Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (ΑΠΔΠΧ)</strong>:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-1">
              <li>Διεύθυνση: Λεωφ. Κηφισίας 1-3, 11523 Αθήνα</li>
              <li>Τηλ: 210 6475600</li>
              <li>Web: <a href="https://www.dpa.gr" target="_blank" rel="noreferrer" className="text-primary underline">www.dpa.gr</a></li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">10. Αλλαγές στην πολιτική</h2>
            <p>
              Μπορεί να ενημερώνουμε αυτή την πολιτική περιοδικά. Σε κάθε σημαντική αλλαγή θα σας ειδοποιούμε με email και θα ζητάμε νέα συγκατάθεση όπου χρειάζεται. Η έκδοση αναγράφεται στην κορυφή αυτής της σελίδας.
            </p>
          </div>
        </section>

        <div className="mt-8 pt-6 border-t border-outline-variant/20 text-center">
          <Link href="/" className="text-sm text-primary underline">Επιστροφή στην αρχική</Link>
        </div>
      </div>
    </main>
  )
}
