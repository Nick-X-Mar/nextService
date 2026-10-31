import { EmailTemplate, type EmailTemplateName } from '@/types/events'
import { SITE_URL } from '@/lib/site-url'

/**
 * Every email the platform sends, with the copy it ships with.
 *
 * The copy is plain text an admin can rewrite on /admin/emails/templates: a
 * stored override (src/lib/email-content.ts) replaces any of the four fields,
 * and this file stays the fallback — same rule as the page CMS. The link, the
 * recipients and the moment of sending are code and not editable.
 *
 * Copy syntax, shared with the two Lambdas that carry a copy of the renderer:
 * - `{token}` is replaced by a value; the tokens are each email's `variables`.
 * - a blank line starts a new paragraph, `**text**` is bold.
 * - a paragraph whose token has no value is left out, which is how optional
 *   lines (an amount, refunded points) disappear when there is nothing to say.
 */

export type EmailAudience = 'client' | 'garage' | 'account' | 'admin'

export const EMAIL_AUDIENCE_LABELS: Record<EmailAudience, string> = {
  client: 'Πελάτες',
  garage: 'Συνεργεία',
  account: 'Λογαριασμός (πελάτες και συνεργεία)',
  admin: 'Admin',
}

export interface EmailCopy {
  subject: string
  heading: string
  body: string
  /** Empty for an email without a button. */
  ctaLabel: string
  /** Small grey print under the button. */
  note: string
}

export interface EmailVariable {
  token: string
  label: string
  example: string
  /** Reads the value out of the variables the sending route passes. */
  value: (v: Record<string, string>) => string
}

export interface EmailDefinition {
  name: EmailTemplateName
  label: string
  audience: EmailAudience
  /** When it is sent, in plain words, for whoever reads the admin page. */
  trigger: string
  sentBy: 'app' | 'lambda'
  variables: EmailVariable[]
  /** What the sending route passes, used for the preview and the test send. */
  example: Record<string, string>
  copy: EmailCopy
  /** The button's target. No function, no button. */
  ctaUrl?: (v: Record<string, string>) => string
}

/** Every link in every email is built from SITE_URL and nothing else. */
export const link = (path: string) => `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`

/** `2026-10-28` (or `2026-10-28, 10:00`) → `28/10/2026` (`28/10/2026, 10:00`). */
export const greekDate = (value?: string) =>
  (value || '').replace(/^(\d{4})-(\d{2})-(\d{2})/, (_, y, m, d) => `${d}/${m}/${y}`)

// Through the login page: a garage may well be logged out by the time it opens
// the mail (approval can take days).
const garageDeepLink = (garageId?: string) =>
  garageId
    ? link(`/login/?next=${encodeURIComponent(`/garage-dashboard/${garageId}/`)}`)
    : link('/login/')

const field = (
  key: string,
  token: string,
  label: string,
  example: string,
  fallback = ''
): EmailVariable => ({
  token,
  label,
  example,
  value: (v) => v[key] || fallback,
})

const date = (key: string, token: string, label: string, example: string): EmailVariable => ({
  token,
  label,
  example,
  value: (v) => greekDate(v[key]),
})

const car: EmailVariable = {
  token: 'αυτοκίνητο',
  label: 'Μάρκα και μοντέλο',
  example: 'Toyota Yaris',
  value: (v) => [v.brand, v.model].filter(Boolean).join(' '),
}

const EXAMPLE_IDS = {
  clientId: 'client-example',
  garageId: 'garage-example',
  requestId: 'request-example',
}

export const EMAIL_DEFINITIONS: EmailDefinition[] = [
  // ── Clients ─────────────────────────────────────────────────────────────
  {
    name: EmailTemplate.RequestConfirmation,
    label: 'Επιβεβαίωση αιτήματος',
    audience: 'client',
    trigger: 'Μόλις ο πελάτης στείλει νέο αίτημα.',
    sentBy: 'app',
    variables: [car, field('category', 'κατηγορία', 'Εργασία', 'Service Αυτοκινήτων')],
    example: { ...EXAMPLE_IDS, brand: 'Toyota', model: 'Yaris', category: 'Service Αυτοκινήτων' },
    copy: {
      subject: 'Λάβαμε το αίτημά σου',
      heading: 'Ευχαριστούμε!',
      body:
        'Καταχωρήσαμε το αίτημά σου για **{κατηγορία}** στο **{αυτοκίνητο}**.\n\n' +
        'Τα συνεργεία του NextService βλέπουν τώρα το αίτημα και θα σου στείλουν προσφορές. Θα σε ειδοποιούμε με email για κάθε νέα προσφορά.',
      ctaLabel: 'Δες το αίτημά σου',
      note: '',
    },
    ctaUrl: (v) => link(`/requests/${v.clientId || ''}/`),
  },
  {
    name: EmailTemplate.NewOfferReceived,
    label: 'Νέα προσφορά',
    audience: 'client',
    trigger: 'Όταν ένα συνεργείο στέλνει προσφορά στο αίτημα του πελάτη. Ένα email για κάθε προσφορά.',
    sentBy: 'app',
    variables: [
      field('garageName', 'συνεργείο', 'Επωνυμία συνεργείου', 'Auto Fix Παπαδόπουλος'),
      field('offerAmount', 'ποσό', 'Ποσό προσφοράς (χωρίς ΦΠΑ)', '180'),
    ],
    example: { ...EXAMPLE_IDS, garageName: 'Auto Fix Παπαδόπουλος', offerAmount: '180' },
    copy: {
      subject: 'Έλαβες νέα προσφορά',
      heading: 'Νέα προσφορά για το αίτημά σου',
      body:
        'Το συνεργείο **{συνεργείο}** σου έστειλε προσφορά **{ποσό}€ + ΦΠΑ**.\n\n' +
        'Μπες στην εφαρμογή για να δεις τις λεπτομέρειες, να μιλήσεις με το συνεργείο και να την αποδεχτείς αν σε ενδιαφέρει.',
      ctaLabel: 'Δες την προσφορά',
      note: '',
    },
    ctaUrl: (v) => link(`/requests/${v.clientId || ''}/details/${v.requestId || ''}/`),
  },
  {
    name: EmailTemplate.AppointmentConfirmationClient,
    label: 'Επιβεβαίωση ραντεβού',
    audience: 'client',
    trigger: 'Όταν ο πελάτης αποδέχεται μια προσφορά και κλείνει ραντεβού.',
    sentBy: 'app',
    variables: [
      field('garageName', 'συνεργείο', 'Επωνυμία συνεργείου', 'Auto Fix Παπαδόπουλος'),
      date('appointmentDate', 'ημερομηνία', 'Ημερομηνία και ώρα ραντεβού', '05/11/2026, 10:00'),
      field('appointmentPrice', 'ποσό', 'Συμφωνημένο ποσό (χωρίς ΦΠΑ)', '180'),
    ],
    example: {
      ...EXAMPLE_IDS,
      garageName: 'Auto Fix Παπαδόπουλος',
      appointmentDate: '2026-11-05, 10:00',
      appointmentPrice: '180',
    },
    copy: {
      subject: 'Επιβεβαίωση ραντεβού',
      heading: 'Το ραντεβού σου κλείστηκε',
      body:
        'Έχεις ραντεβού με το συνεργείο **{συνεργείο}** στις **{ημερομηνία}**.\n\n' +
        'Συμφωνημένο κόστος: **{ποσό}€ + ΦΠΑ**\n\n' +
        'Όλες οι λεπτομέρειες είναι στην εφαρμογή.',
      ctaLabel: 'Δες το ραντεβού',
      note: '',
    },
    ctaUrl: (v) => link(`/requests/${v.clientId || ''}/details/${v.requestId || ''}/`),
  },
  {
    name: EmailTemplate.PaymentConfirmationClient,
    label: 'Επιβεβαίωση πληρωμής προκαταβολής',
    audience: 'client',
    trigger: 'Μαζί με την επιβεβαίωση ραντεβού, μόνο όταν ο πελάτης πλήρωσε προκαταβολή με κάρτα.',
    sentBy: 'app',
    variables: [
      field('depositAmount', 'προκαταβολή', 'Προκαταβολή', '27'),
      field('garageName', 'συνεργείο', 'Επωνυμία συνεργείου', 'Auto Fix Παπαδόπουλος'),
      date('appointmentDate', 'ημερομηνία', 'Ημερομηνία και ώρα ραντεβού', '05/11/2026, 10:00'),
      field('remainingAmount', 'υπόλοιπο', 'Υπόλοιπο στο συνεργείο', '153'),
    ],
    example: {
      ...EXAMPLE_IDS,
      depositAmount: '27',
      garageName: 'Auto Fix Παπαδόπουλος',
      appointmentDate: '2026-11-05, 10:00',
      remainingAmount: '153',
    },
    copy: {
      subject: 'Επιβεβαίωση πληρωμής',
      heading: 'Η πληρωμή σου ολοκληρώθηκε',
      body:
        'Πλήρωσες προκαταβολή **{προκαταβολή}€** για το ραντεβού σου με το συνεργείο **{συνεργείο}** στις **{ημερομηνία}**.\n\n' +
        '**Υπόλοιπο στο συνεργείο:** {υπόλοιπο}€ + ΦΠΑ',
      ctaLabel: 'Δες το ραντεβού',
      note: '',
    },
    ctaUrl: (v) => link(`/requests/${v.clientId || ''}/details/${v.requestId || ''}/`),
  },
  {
    name: EmailTemplate.CancellationConfirmationClient,
    label: 'Ακύρωση ραντεβού (στον πελάτη)',
    audience: 'client',
    trigger: 'Όταν ο πελάτης ακυρώνει το ραντεβού του.',
    sentBy: 'app',
    variables: [
      field('garageName', 'συνεργείο', 'Επωνυμία συνεργείου', 'Auto Fix Παπαδόπουλος'),
      date('appointmentDate', 'ημερομηνία', 'Ημερομηνία ραντεβού', '05/11/2026'),
      field('refundPoints', 'πόντοι', 'Πόντοι που επιστράφηκαν (αν υπάρχουν)', '27'),
    ],
    example: {
      ...EXAMPLE_IDS,
      garageName: 'Auto Fix Παπαδόπουλος',
      appointmentDate: '2026-11-05',
      refundPoints: '27',
    },
    copy: {
      subject: 'Ακύρωση ραντεβού',
      heading: 'Το ραντεβού σου ακυρώθηκε',
      body:
        'Το ραντεβού σου με το συνεργείο **{συνεργείο}** στις **{ημερομηνία}** ακυρώθηκε.\n\n' +
        '**{πόντοι} πόντοι** πιστώθηκαν στο πορτοφόλι σου.',
      ctaLabel: '',
      note: '',
    },
  },

  // ── Clients and garages ─────────────────────────────────────────────────
  {
    name: EmailTemplate.NewChatMessage,
    label: 'Νέο μήνυμα στη συνομιλία',
    audience: 'account',
    trigger:
      'Όταν κάποιος γράφει στη συνομιλία και ο άλλος δεν τη διαβάζει εκείνη την ώρα. Πηγαίνει και σε πελάτες και σε συνεργεία, το πολύ ένα email ανά 15 λεπτά για κάθε συνομιλία.',
    sentBy: 'app',
    variables: [
      field('senderName', 'αποστολέας', 'Ποιος έγραψε (επωνυμία συνεργείου ή μικρό όνομα πελάτη)', 'Auto Fix Παπαδόπουλος'),
    ],
    example: {
      senderName: 'Auto Fix Παπαδόπουλος',
      chatUrl: `/requests/${EXAMPLE_IDS.clientId}/chats/${EXAMPLE_IDS.requestId}/`,
    },
    copy: {
      subject: 'Νέο μήνυμα στη συνομιλία σου',
      heading: 'Έχεις νέο μήνυμα',
      body: '**{αποστολέας}** σου έστειλε νέο μήνυμα για ένα αίτημα στο NextService.',
      ctaLabel: 'Άνοιγμα συνομιλίας',
      note: '',
    },
    ctaUrl: (v) => link(v.chatUrl || '/'),
  },
  {
    name: EmailTemplate.PasswordReset,
    label: 'Επαναφορά κωδικού',
    audience: 'account',
    trigger: 'Όταν κάποιος πατάει «Ξέχασα τον κωδικό μου».',
    sentBy: 'app',
    variables: [field('displayName', 'όνομα', 'Όνομα λογαριασμού', 'Γιώργος')],
    example: { displayName: 'Γιώργος', resetPath: '/reset-password/?token=example' },
    copy: {
      subject: 'Επαναφορά κωδικού NextService',
      heading: 'Ζήτησες επαναφορά κωδικού',
      body:
        'Λάβαμε αίτημα επαναφοράς κωδικού για τον λογαριασμό σου στο NextService.\n\n' +
        'Πάτησε το κουμπί για να ορίσεις νέο κωδικό. Ο σύνδεσμος ισχύει για **1 ώρα**.',
      ctaLabel: 'Ορισμός νέου κωδικού',
      note: 'Αν δεν το ζήτησες εσύ, αγνόησε αυτό το email. Ο κωδικός σου μένει ίδιος.',
    },
    ctaUrl: (v) => link(v.resetPath || '/forgot-password/'),
  },
  // Sent to the owner of an existing account when a guest session asks to fold
  // its requests into it. Deliberately carries nothing the guest typed: the
  // recipient may be the target of someone else's attempt, and a mail that
  // reads like their own activity is how they'd be talked into clicking.
  {
    name: EmailTemplate.AccountMergeConfirmation,
    label: 'Σύνδεση αιτημάτων σε υπάρχοντα λογαριασμό',
    audience: 'account',
    trigger:
      'Όταν κάποιος στέλνει αίτημα χωρίς σύνδεση με email που έχει ήδη λογαριασμό, και ζητά να μπει το αίτημα σε αυτόν.',
    sentBy: 'app',
    variables: [],
    example: { confirmPath: '/confirm-account/?token=example' },
    copy: {
      subject: 'Επιβεβαίωσε τη σύνδεση αιτημάτων στον λογαριασμό σου',
      heading: 'Σύνδεση αιτημάτων στον λογαριασμό σου',
      body:
        'Κάποιος ζήτησε να συνδεθούν με τον λογαριασμό σου στο NextService αιτήματα service που καταχωρήθηκαν χωρίς σύνδεση.\n\n' +
        'Αν ήσουν εσύ, πάτησε το κουμπί. Τα αιτήματα θα εμφανιστούν στη λίστα σου και θα συνδεθείς σε αυτή τη συσκευή. Ο σύνδεσμος ισχύει για **1 ώρα** και μόνο για μία χρήση.',
      ctaLabel: 'Επιβεβαίωση σύνδεσης',
      note: 'Αν δεν το ζήτησες εσύ, αγνόησε αυτό το email. Ο λογαριασμός σου δεν θα αλλάξει.',
    },
    ctaUrl: (v) => link(v.confirmPath || '/login/'),
  },

  // ── Garages ─────────────────────────────────────────────────────────────
  {
    name: EmailTemplate.NewRequestForGarages,
    label: 'Νέο αίτημα για προσφορά',
    audience: 'garage',
    trigger: 'Μόλις ένας πελάτης στείλει νέο αίτημα. Πηγαίνει σε όλα τα ενεργά συνεργεία.',
    sentBy: 'lambda',
    variables: [
      field('companyName', 'επωνυμία', 'Επωνυμία συνεργείου', 'Auto Fix Παπαδόπουλος'),
      car,
      field('category', 'κατηγορία', 'Εργασία', 'Service Αυτοκινήτων'),
    ],
    example: {
      ...EXAMPLE_IDS,
      companyName: 'Auto Fix Παπαδόπουλος',
      brand: 'Toyota',
      model: 'Yaris',
      category: 'Service Αυτοκινήτων',
    },
    copy: {
      subject: 'Νέο αίτημα για προσφορά στο NextService',
      heading: 'Νέο αίτημα διαθέσιμο',
      body:
        'Γεια σου {επωνυμία},\n\n' +
        'Ένας πελάτης μόλις ζήτησε προσφορά για **{κατηγορία}** στο **{αυτοκίνητο}**.\n\n' +
        'Δες την περιγραφή και τις φωτογραφίες στο dashboard και στείλε την προσφορά σου πριν από τα άλλα συνεργεία.',
      ctaLabel: 'Δες το αίτημα',
      note: '',
    },
    ctaUrl: (v) => link(`/garage-dashboard/${encodeURIComponent(v.garageId || '')}/?tab=requests`),
  },
  {
    name: EmailTemplate.OfferAcceptedGarage,
    label: 'Η προσφορά έγινε δεκτή',
    audience: 'garage',
    trigger: 'Όταν ο πελάτης αποδέχεται την προσφορά του συνεργείου και κλείνει ραντεβού.',
    sentBy: 'app',
    variables: [
      field('offerAmount', 'ποσό', 'Ποσό προσφοράς (χωρίς ΦΠΑ)', '180'),
      date('appointmentDate', 'ημερομηνία', 'Ημερομηνία και ώρα ραντεβού', '05/11/2026, 10:00'),
    ],
    example: { ...EXAMPLE_IDS, offerAmount: '180', appointmentDate: '2026-11-05, 10:00' },
    copy: {
      subject: 'Η προσφορά σου έγινε δεκτή',
      heading: 'Συγχαρητήρια!',
      body:
        'Ο πελάτης αποδέχτηκε την προσφορά σου **{ποσό}€ + ΦΠΑ**.\n\n' +
        'Ραντεβού: **{ημερομηνία}**\n\n' +
        'Τα στοιχεία του πελάτη και του αυτοκινήτου είναι πλέον στο dashboard σου.',
      ctaLabel: 'Άνοιγμα dashboard',
      note: '',
    },
    ctaUrl: (v) => link(`/garage-dashboard/${v.garageId || ''}/?tab=appointments`),
  },
  {
    name: EmailTemplate.CancellationNotificationGarage,
    label: 'Ακύρωση ραντεβού (στο συνεργείο)',
    audience: 'garage',
    trigger: 'Όταν ο πελάτης ακυρώνει ραντεβού με το συνεργείο.',
    sentBy: 'app',
    variables: [
      field('clientName', 'πελάτης', 'Μικρό όνομα πελάτη', 'Γιώργος'),
      date('appointmentDate', 'ημερομηνία', 'Ημερομηνία ραντεβού', '05/11/2026'),
    ],
    example: { ...EXAMPLE_IDS, clientName: 'Γιώργος', appointmentDate: '2026-11-05' },
    copy: {
      subject: 'Ακύρωση ραντεβού πελάτη',
      heading: 'Ακυρώθηκε ραντεβού',
      body:
        'Ο πελάτης **{πελάτης}** ακύρωσε το ραντεβού του στις **{ημερομηνία}**.\n\n' +
        'Η ώρα είναι πλέον ελεύθερη στο πρόγραμμά σου.',
      ctaLabel: 'Άνοιγμα dashboard',
      note: '',
    },
    ctaUrl: (v) => link(`/garage-dashboard/${v.garageId || ''}/?tab=appointments`),
  },
  {
    name: EmailTemplate.CompletionPromptGarage,
    label: 'Δήλωση ολοκλήρωσης εργασίας',
    audience: 'garage',
    trigger:
      'Λίγες ώρες μετά το ραντεβού, αν το συνεργείο δεν έχει δηλώσει ακόμα τι έγινε. Μία φορά για κάθε ραντεβού.',
    sentBy: 'lambda',
    variables: [
      field('companyName', 'επωνυμία', 'Επωνυμία συνεργείου', 'Auto Fix Παπαδόπουλος'),
      date('appointmentDate', 'ημερομηνία', 'Ημερομηνία ραντεβού', '05/11/2026'),
    ],
    example: { ...EXAMPLE_IDS, companyName: 'Auto Fix Παπαδόπουλος', appointmentDate: '2026-11-05' },
    copy: {
      subject: 'Έγινε η επισκευή; Δήλωσέ το στο NextService',
      heading: 'Έγινε η επισκευή;',
      body:
        'Γεια σου {επωνυμία},\n\n' +
        'Το ραντεβού της **{ημερομηνία}** έχει περάσει και δεν μας έχεις πει τι έγινε.\n\n' +
        'Δήλωσε αν έγινε η εργασία, το ποσό που χρέωσες και πώς σου φάνηκε ο πελάτης. Παίρνει λιγότερο από ένα λεπτό και χρειάζεται για την εκκαθάριση.',
      ctaLabel: 'Δήλωσε την ολοκλήρωση',
      note: '',
    },
    ctaUrl: (v) =>
      link(`/login/?next=${encodeURIComponent(`/garage-dashboard/${v.garageId || ''}/?tab=appointments`)}`),
  },
  {
    name: EmailTemplate.WelcomeGarage,
    label: 'Καλωσόρισμα συνεργείου',
    audience: 'garage',
    trigger: 'Μόλις ένα συνεργείο κάνει εγγραφή. Ο λογαριασμός περιμένει έγκριση από εμάς.',
    sentBy: 'app',
    variables: [field('companyName', 'επωνυμία', 'Επωνυμία συνεργείου', 'Auto Fix Παπαδόπουλος', 'συνεργάτη')],
    example: { ...EXAMPLE_IDS, companyName: 'Auto Fix Παπαδόπουλος' },
    copy: {
      subject: 'Καλωσόρισες στο NextService',
      heading: 'Γεια σου {επωνυμία},',
      body:
        'Λάβαμε την εγγραφή σου στο NextService. Θα ελέγξουμε τα στοιχεία της επιχείρησής σου και θα ενεργοποιήσουμε τον λογαριασμό σου σύντομα.\n\n' +
        'Όταν ενεργοποιηθεί, θα βλέπεις τα αιτήματα των πελατών, θα στέλνεις προσφορές και θα μιλάς απευθείας μαζί τους.\n\n' +
        'Θα σε ειδοποιήσουμε με νέο email μόλις ο λογαριασμός σου είναι έτοιμος.',
      ctaLabel: 'Δες την κατάσταση της αίτησής σου',
      note: '',
    },
    ctaUrl: (v) => garageDeepLink(v.garageId),
  },
  {
    name: EmailTemplate.GarageActivated,
    label: 'Ενεργοποίηση λογαριασμού συνεργείου',
    audience: 'garage',
    trigger: 'Όταν εγκρίνουμε ένα συνεργείο από το admin.',
    sentBy: 'app',
    variables: [field('companyName', 'επωνυμία', 'Επωνυμία συνεργείου', 'Auto Fix Παπαδόπουλος', 'Συνεργάτη')],
    example: { ...EXAMPLE_IDS, companyName: 'Auto Fix Παπαδόπουλος' },
    copy: {
      subject: 'Ο λογαριασμός σου ενεργοποιήθηκε',
      heading: '{επωνυμία}, είσαι έτοιμος!',
      body:
        'Ο λογαριασμός σου στο NextService ενεργοποιήθηκε. Μπορείς να συνδεθείς, να δεις τα αιτήματα των πελατών και να αρχίσεις να στέλνεις προσφορές.\n\n' +
        'Για κάθε νέο αίτημα θα σου στέλνουμε email.',
      ctaLabel: 'Είσοδος στο dashboard',
      note: '',
    },
    ctaUrl: (v) => garageDeepLink(v.garageId),
  },

  // ── Admin ───────────────────────────────────────────────────────────────
  {
    name: EmailTemplate.AdminNewGarageValidation,
    label: 'Νέο συνεργείο για έγκριση',
    audience: 'admin',
    trigger: 'Μόλις ένα συνεργείο κάνει εγγραφή. Πηγαίνει στο email του admin (ADMIN_EMAIL).',
    sentBy: 'app',
    variables: [
      field('companyName', 'επωνυμία', 'Επωνυμία', 'Auto Fix Παπαδόπουλος'),
      field('tin', 'ΑΦΜ', 'ΑΦΜ', '123456789'),
      field('email', 'email', 'Email', 'info@autofix.gr'),
      field('mobile', 'κινητό', 'Κινητό', '6900000000'),
      field('address', 'διεύθυνση', 'Διεύθυνση', 'Λεωφ. Κηφισίας 100, Αθήνα'),
    ],
    example: {
      companyName: 'Auto Fix Παπαδόπουλος',
      tin: '123456789',
      email: 'info@autofix.gr',
      mobile: '6900000000',
      address: 'Λεωφ. Κηφισίας 100, Αθήνα',
    },
    copy: {
      subject: '[Admin] Νέο συνεργείο για έγκριση: {επωνυμία}',
      heading: 'Νέα εγγραφή συνεργείου',
      body:
        '**Επωνυμία:** {επωνυμία}\n' +
        '**ΑΦΜ:** {ΑΦΜ}\n' +
        '**Email:** {email}\n' +
        '**Κινητό:** {κινητό}\n' +
        '**Διεύθυνση:** {διεύθυνση}',
      ctaLabel: 'Άνοιγμα admin',
      note: '',
    },
    ctaUrl: () => link('/admin/garages/'),
  },
]

const BY_NAME = new Map(EMAIL_DEFINITIONS.map((d) => [d.name, d]))

export function emailDefinition(name: string): EmailDefinition | undefined {
  return BY_NAME.get(name as EmailTemplateName)
}
