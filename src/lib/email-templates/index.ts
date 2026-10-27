import { EmailTemplate, type EmailTemplateName } from '@/types/events'
import { SITE_URL } from '@/lib/site-url'
import { baseLayout, decodeEntities, htmlToPlainText } from './baseLayout'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
  /** The button's target, as written into the HTML (entity-escaped). */
  ctaUrl?: string
}

export type TemplateRenderer = (vars: Record<string, string>) => RenderedEmail

/**
 * Every link in every email is built here, from SITE_URL and nothing else.
 *
 * Callers pass paths, never origins. Links used to be assembled from
 * NEXT_PUBLIC_APP_URL — a variable CDK never provisions — with a
 * `http://localhost:3000` fallback in two of the routes, so password-reset and
 * account-merge mails in AWS pointed at localhost. SITE_URL is CDK-managed
 * (amplify_stack.py) and listed in next.config.ts's runtime env.
 */
const link = (path: string) => `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`

/**
 * Lays a template out and derives its plain-text part. The CTA's URL is
 * appended to the text: a tag-stripped copy keeps the button's label and loses
 * its href, which left text-only mail clients with no link at all.
 */
function page({ subject, bodyHtml, ctaLabel, ctaUrl }: {
  subject: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
}): RenderedEmail {
  const html = baseLayout({ title: subject, bodyHtml, ctaLabel, ctaUrl })
  const cta = ctaLabel && ctaUrl ? `\n\n${decodeEntities(ctaLabel)}: ${decodeEntities(ctaUrl)}` : ''
  return { subject, html, text: `${htmlToPlainText(html)}${cta}`, ctaUrl: ctaLabel ? ctaUrl : undefined }
}

// Deep link through the login page: the recipient may well be logged out by the
// time they open the mail (approval can take days), so we send them to /login
// with the destination attached instead of dropping them on a generic page.
const garageDeepLink = (garageId?: string) =>
  garageId
    ? link(`/login/?next=${encodeURIComponent(`/garage-dashboard/${garageId}/`)}`)
    : link('/login/')

const renderers: Record<EmailTemplateName, TemplateRenderer> = {
  [EmailTemplate.WelcomeGarage]: (v) => {
    const subject = 'Καλωσόρισες στο NextService'
    return page({
      subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Γεια σου ${v.companyName || 'συνεργάτη'},</h2>
        <p>Λάβαμε την εγγραφή σου στο NextService. Η ομάδα μας θα ελέγξει τα στοιχεία της εταιρείας σου και θα ενεργοποιήσει τον λογαριασμό σου σύντομα.</p>
        <p>Όταν ενεργοποιηθεί, θα μπορείς να βλέπεις αιτήματα πελατών, να στέλνεις προσφορές και να συνομιλείς απευθείας μαζί τους.</p>
        <p>Θα σε ειδοποιήσουμε με νέο email μόλις ο λογαριασμός σου είναι έτοιμος.</p>
      `,
      ctaLabel: 'Δες την κατάσταση της αίτησής σου',
      ctaUrl: garageDeepLink(v.garageId)
    })
  },

  [EmailTemplate.GarageActivated]: (v) => {
    const subject = 'Ο λογαριασμός σου ενεργοποιήθηκε'
    return page({
      subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">${v.companyName || 'Συνεργείο'}, είσαι έτοιμος!</h2>
        <p>Ο λογαριασμός σου στο NextService ενεργοποιήθηκε. Μπορείς τώρα να συνδεθείς, να δεις διαθέσιμα αιτήματα πελατών στην περιοχή σου και να ξεκινήσεις να στέλνεις προσφορές.</p>
      `,
      ctaLabel: 'Είσοδος στο dashboard',
      ctaUrl: garageDeepLink(v.garageId)
    })
  },

  [EmailTemplate.RequestConfirmation]: (v) => {
    const subject = 'Λάβαμε το αίτημά σου'
    return page({
      subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Ευχαριστούμε!</h2>
        <p>Καταχωρήσαμε το αίτημα service για το <strong>${v.brand || ''} ${v.model || ''}</strong>${v.category ? ` (${v.category})` : ''}.</p>
        <p>Συνεργεία στην περιοχή σου θα δουν το αίτημα και θα σου στείλουν προσφορές. Θα σε ειδοποιήσουμε με email μόλις λάβεις την πρώτη.</p>
      `,
      ctaLabel: 'Δες το αίτημά σου',
      ctaUrl: link(`/requests/${v.clientId || ''}/`)
    })
  },

  [EmailTemplate.NewOfferReceived]: (v) => {
    const subject = 'Έλαβες νέα προσφορά'
    return page({
      subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Νέα προσφορά για το αίτημά σου</h2>
        <p>Το συνεργείο <strong>${v.garageName || ''}</strong> σου έστειλε προσφορά${v.offerAmount ? ` ύψους <strong>${v.offerAmount}€</strong>` : ''}.</p>
        <p>Μπες στην εφαρμογή για να δεις τις λεπτομέρειες, να συνομιλήσεις με το συνεργείο και να αποδεχτείς εφόσον σε ενδιαφέρει.</p>
      `,
      ctaLabel: 'Δες την προσφορά',
      ctaUrl: link(`/requests/${v.clientId || ''}/details/${v.requestId || ''}/`)
    })
  },

  [EmailTemplate.OfferAcceptedGarage]: (v) => {
    const subject = 'Η προσφορά σου έγινε δεκτή'
    return page({
      subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Συγχαρητήρια!</h2>
        <p>Ο πελάτης αποδέχτηκε την προσφορά σου${v.offerAmount ? ` ύψους <strong>${v.offerAmount}€</strong>` : ''}${v.appointmentDate ? ` και προγραμμάτισε ραντεβού για <strong>${v.appointmentDate}</strong>` : ''}.</p>
        <p>Δες τις λεπτομέρειες του ραντεβού στο dashboard σου.</p>
      `,
      ctaLabel: 'Άνοιγμα dashboard',
      ctaUrl: link(`/garage-dashboard/${v.garageId || ''}/?tab=appointments`)
    })
  },

  [EmailTemplate.AppointmentConfirmationClient]: (v) => {
    const subject = 'Επιβεβαίωση ραντεβού'
    return page({
      subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Το ραντεβού σου επιβεβαιώθηκε</h2>
        <p>Έχεις προγραμματίσει ραντεβού με το συνεργείο <strong>${v.garageName || ''}</strong> για τις <strong>${v.appointmentDate || ''}</strong>${v.appointmentPrice ? ` με συμφωνημένο κόστος <strong>${v.appointmentPrice}€</strong>` : ''}.</p>
        <p>Μπορείς να δεις όλες τις λεπτομέρειες στην εφαρμογή.</p>
      `,
      ctaLabel: 'Δες το ραντεβού',
      ctaUrl: link(`/requests/${v.clientId || ''}/details/${v.requestId || ''}/`)
    })
  },

  [EmailTemplate.NewChatMessage]: (v) => {
    const subject = 'Νέο μήνυμα στη συνομιλία σου'
    return page({
      subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Έχεις νέο μήνυμα</h2>
        <p>Ο/η <strong>${v.senderName || ''}</strong> σου έστειλε ένα νέο μήνυμα σχετικά με το αίτημά σου.</p>
      `,
      ctaLabel: 'Άνοιγμα συνομιλίας',
      ctaUrl: link(v.chatUrl || '/')
    })
  },

  [EmailTemplate.PasswordReset]: (v) => {
    const subject = 'Επαναφορά κωδικού NextService'
    return page({
      subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Ζήτησες επαναφορά κωδικού</h2>
        <p>Λάβαμε αίτημα επαναφοράς κωδικού για τον λογαριασμό σου στο NextService${v.displayName ? ` (${v.displayName})` : ''}.</p>
        <p>Πάτησε το παρακάτω κουμπί για να ορίσεις νέο κωδικό. Ο σύνδεσμος ισχύει για <strong>1 ώρα</strong>.</p>
        <p style="margin-top:20px;color:#6b7280;font-size:13px;">Αν δεν έκανες εσύ αυτό το αίτημα, αγνόησε αυτό το email — ο κωδικός σου παραμένει ο ίδιος.</p>
      `,
      ctaLabel: 'Ορισμός νέου κωδικού',
      ctaUrl: link(v.resetPath || '/forgot-password/')
    })
  },

  [EmailTemplate.PaymentConfirmationClient]: (v) => {
    const subject = 'Επιβεβαίωση πληρωμής'
    return page({
      subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Η πληρωμή σου ολοκληρώθηκε</h2>
        <p>Καταβλήθηκε προκαταβολή <strong>${v.depositAmount || ''}€</strong> για το ραντεβού σου με το συνεργείο <strong>${v.garageName || ''}</strong> στις <strong>${v.appointmentDate || ''}</strong>.</p>
        <p><strong>Υπόλοιπο στο συνεργείο:</strong> ${v.remainingAmount || ''}€</p>
        <p>Μπορείς να δεις τις λεπτομέρειες στην εφαρμογή.</p>
      `,
      ctaLabel: 'Δες το ραντεβού',
      ctaUrl: link(`/requests/${v.clientId || ''}/details/${v.requestId || ''}/`)
    })
  },

  [EmailTemplate.CancellationConfirmationClient]: (v) => {
    const subject = 'Ακύρωση ραντεβού'
    const refundText = v.refundPoints
      ? `<p><strong>${v.refundPoints} πόντοι</strong> πιστώθηκαν στο πορτοφόλι σου.</p>`
      : '<p>Δεν δικαιούσαι επιστροφή πόντων για αυτή την ακύρωση.</p>'
    return page({
      subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Το ραντεβού σου ακυρώθηκε</h2>
        <p>Το ραντεβού σου με το συνεργείο <strong>${v.garageName || ''}</strong> στις <strong>${v.appointmentDate || ''}</strong> ακυρώθηκε.</p>
        ${refundText}
      `
    })
  },

  [EmailTemplate.CancellationNotificationGarage]: (v) => {
    const subject = 'Ακύρωση ραντεβού πελάτη'
    return page({
      subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Ακυρώθηκε ραντεβού</h2>
        <p>Ο πελάτης <strong>${v.clientName || ''}</strong> ακύρωσε το ραντεβού του στις <strong>${v.appointmentDate || ''}</strong>.</p>
        <p>Η ημερομηνία είναι πλέον διαθέσιμη στο πρόγραμμά σου.</p>
      `,
      ctaLabel: 'Άνοιγμα dashboard',
      ctaUrl: link(`/garage-dashboard/${v.garageId || ''}/?tab=appointments`)
    })
  },

  // Sent to the owner of an existing account when a guest session asks to
  // fold its requests into it. Deliberately carries nothing the guest typed
  // (name, vehicle, notes): the recipient may be the target of someone else's
  // attempt, and a mail that reads like their own activity is how they'd be
  // talked into clicking.
  [EmailTemplate.AccountMergeConfirmation]: (v) => {
    const subject = 'Επιβεβαίωσε τη σύνδεση αιτημάτων στον λογαριασμό σου'
    return page({
      subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Σύνδεση αιτημάτων στον λογαριασμό σου</h2>
        <p>Κάποιος ζήτησε να συνδεθούν με τον λογαριασμό σου στο NextService αιτήματα service που καταχωρήθηκαν χωρίς σύνδεση.</p>
        <p>Αν ήσουν εσύ, πάτησε το παρακάτω κουμπί. Τα αιτήματα θα εμφανιστούν στη λίστα σου και θα συνδεθείς αυτόματα σε αυτή τη συσκευή. Ο σύνδεσμος ισχύει για <strong>1 ώρα</strong> και χρησιμοποιείται μόνο μία φορά.</p>
        <p style="margin-top:20px;color:#6b7280;font-size:13px;">Αν δεν το ζήτησες εσύ, αγνόησε αυτό το email. Ο λογαριασμός σου δεν θα αλλάξει.</p>
      `,
      ctaLabel: 'Επιβεβαίωση σύνδεσης',
      ctaUrl: link(v.confirmPath || '/login/')
    })
  },

  [EmailTemplate.AdminNewGarageValidation]: (v) => {
    const subject = `[Admin] Νέο συνεργείο για επιβεβαίωση: ${v.companyName || ''}`
    return page({
      subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Νέα εγγραφή συνεργείου</h2>
        <p><strong>Εταιρεία:</strong> ${v.companyName || '-'}</p>
        <p><strong>ΑΦΜ:</strong> ${v.tin || '-'}</p>
        <p><strong>Email:</strong> ${v.email || '-'}</p>
        <p><strong>Κινητό:</strong> ${v.mobile || '-'}</p>
        <p><strong>Διεύθυνση:</strong> ${v.address || '-'}</p>
        <p style="margin-top:16px;color:#6b7280;font-size:13px;">Πήγαινε στο admin για να την επιβεβαιώσεις.</p>
      `
    })
  }
}

export function renderEmail(
  templateName: EmailTemplateName,
  variables: Record<string, string>
): RenderedEmail {
  const renderer = renderers[templateName]
  if (!renderer) {
    throw new Error(`Unknown email template: ${templateName}`)
  }
  // Every variable is interpolated straight into HTML, and several are typed by
  // other users — a garage's company name lands in a client's inbox. Escaping
  // here, once, means no template can forget to.
  const escaped: Record<string, string> = {}
  for (const [key, value] of Object.entries(variables)) {
    escaped[key] = escapeHtml(String(value ?? ''))
  }
  const rendered = renderer(escaped)
  // The subject is a mail header, not HTML.
  return { ...rendered, subject: decodeEntities(rendered.subject) }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
