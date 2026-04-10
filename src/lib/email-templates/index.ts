import { EmailTemplate, type EmailTemplateName } from '@/types/events'
import { baseLayout, htmlToPlainText } from './baseLayout'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export type TemplateRenderer = (vars: Record<string, string>) => RenderedEmail

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nextservice.gr'

const link = (path: string) => `${APP_URL}${path}`

const renderers: Record<EmailTemplateName, TemplateRenderer> = {
  [EmailTemplate.WelcomeGarage]: (v) => {
    const subject = 'Καλωσόρισες στο NextService'
    const html = baseLayout({
      title: subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Γεια σου ${v.companyName || 'συνεργάτη'},</h2>
        <p>Λάβαμε την εγγραφή σου στο NextService. Η ομάδα μας θα ελέγξει τα στοιχεία της εταιρείας σου και θα ενεργοποιήσει τον λογαριασμό σου σύντομα.</p>
        <p>Όταν ενεργοποιηθεί, θα μπορείς να βλέπεις αιτήματα πελατών, να στέλνεις προσφορές και να συνομιλείς απευθείας μαζί τους.</p>
        <p>Θα σε ειδοποιήσουμε με νέο email μόλις ο λογαριασμός σου είναι έτοιμος.</p>
      `
    })
    return { subject, html, text: htmlToPlainText(html) }
  },

  [EmailTemplate.GarageActivated]: (v) => {
    const subject = 'Ο λογαριασμός σου ενεργοποιήθηκε'
    const html = baseLayout({
      title: subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">${v.companyName || 'Συνεργείο'}, είσαι έτοιμος!</h2>
        <p>Ο λογαριασμός σου στο NextService ενεργοποιήθηκε. Μπορείς τώρα να συνδεθείς, να δεις διαθέσιμα αιτήματα πελατών στην περιοχή σου και να ξεκινήσεις να στέλνεις προσφορές.</p>
      `,
      ctaLabel: 'Είσοδος στο dashboard',
      ctaUrl: link('/login')
    })
    return { subject, html, text: htmlToPlainText(html) }
  },

  [EmailTemplate.RequestConfirmation]: (v) => {
    const subject = 'Λάβαμε το αίτημά σου'
    const html = baseLayout({
      title: subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Ευχαριστούμε!</h2>
        <p>Καταχωρήσαμε το αίτημα service για το <strong>${v.brand || ''} ${v.model || ''}</strong>${v.category ? ` (${v.category})` : ''}.</p>
        <p>Συνεργεία στην περιοχή σου θα δουν το αίτημα και θα σου στείλουν προσφορές. Θα σε ειδοποιήσουμε με email μόλις λάβεις την πρώτη.</p>
      `,
      ctaLabel: 'Δες το αίτημά σου',
      ctaUrl: link(`/requests/${v.clientId || ''}`)
    })
    return { subject, html, text: htmlToPlainText(html) }
  },

  [EmailTemplate.NewOfferReceived]: (v) => {
    const subject = 'Έλαβες νέα προσφορά'
    const html = baseLayout({
      title: subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Νέα προσφορά για το αίτημά σου</h2>
        <p>Το συνεργείο <strong>${v.garageName || ''}</strong> σου έστειλε προσφορά${v.offerAmount ? ` ύψους <strong>${v.offerAmount}€</strong>` : ''}.</p>
        <p>Μπες στην εφαρμογή για να δεις τις λεπτομέρειες, να συνομιλήσεις με το συνεργείο και να αποδεχτείς εφόσον σε ενδιαφέρει.</p>
      `,
      ctaLabel: 'Δες την προσφορά',
      ctaUrl: link(`/requests/${v.clientId || ''}/details/${v.requestId || ''}`)
    })
    return { subject, html, text: htmlToPlainText(html) }
  },

  [EmailTemplate.OfferAcceptedGarage]: (v) => {
    const subject = 'Η προσφορά σου έγινε δεκτή'
    const html = baseLayout({
      title: subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Συγχαρητήρια!</h2>
        <p>Ο πελάτης αποδέχτηκε την προσφορά σου${v.offerAmount ? ` ύψους <strong>${v.offerAmount}€</strong>` : ''}${v.appointmentDate ? ` και προγραμμάτισε ραντεβού για <strong>${v.appointmentDate}</strong>` : ''}.</p>
        <p>Δες τις λεπτομέρειες του ραντεβού στο dashboard σου.</p>
      `,
      ctaLabel: 'Άνοιγμα dashboard',
      ctaUrl: link(`/garage-dashboard/${v.garageId || ''}?tab=appointments`)
    })
    return { subject, html, text: htmlToPlainText(html) }
  },

  [EmailTemplate.AppointmentConfirmationClient]: (v) => {
    const subject = 'Επιβεβαίωση ραντεβού'
    const html = baseLayout({
      title: subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Το ραντεβού σου επιβεβαιώθηκε</h2>
        <p>Έχεις προγραμματίσει ραντεβού με το συνεργείο <strong>${v.garageName || ''}</strong> για τις <strong>${v.appointmentDate || ''}</strong>${v.appointmentPrice ? ` με συμφωνημένο κόστος <strong>${v.appointmentPrice}€</strong>` : ''}.</p>
        <p>Μπορείς να δεις όλες τις λεπτομέρειες στην εφαρμογή.</p>
      `,
      ctaLabel: 'Δες το ραντεβού',
      ctaUrl: link(`/requests/${v.clientId || ''}/details/${v.requestId || ''}`)
    })
    return { subject, html, text: htmlToPlainText(html) }
  },

  [EmailTemplate.NewChatMessage]: (v) => {
    const subject = 'Νέο μήνυμα στη συνομιλία σου'
    const html = baseLayout({
      title: subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Έχεις νέο μήνυμα</h2>
        <p>Ο/η <strong>${v.senderName || ''}</strong> σου έστειλε ένα νέο μήνυμα σχετικά με το αίτημά σου.</p>
      `,
      ctaLabel: 'Άνοιγμα συνομιλίας',
      ctaUrl: link(v.chatUrl || '/')
    })
    return { subject, html, text: htmlToPlainText(html) }
  },

  [EmailTemplate.PasswordReset]: (v) => {
    const subject = 'Επαναφορά κωδικού NextService'
    const html = baseLayout({
      title: subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Ζήτησες επαναφορά κωδικού</h2>
        <p>Λάβαμε αίτημα επαναφοράς κωδικού για τον λογαριασμό σου στο NextService${v.displayName ? ` (${v.displayName})` : ''}.</p>
        <p>Πάτησε το παρακάτω κουμπί για να ορίσεις νέο κωδικό. Ο σύνδεσμος ισχύει για <strong>1 ώρα</strong>.</p>
        <p style="margin-top:20px;color:#6b7280;font-size:13px;">Αν δεν έκανες εσύ αυτό το αίτημα, αγνόησε αυτό το email — ο κωδικός σου παραμένει ο ίδιος.</p>
      `,
      ctaLabel: 'Ορισμός νέου κωδικού',
      ctaUrl: v.resetUrl || link('/forgot-password')
    })
    return { subject, html, text: htmlToPlainText(html) }
  },

  [EmailTemplate.PaymentConfirmationClient]: (v) => {
    const subject = 'Επιβεβαίωση πληρωμής'
    const html = baseLayout({
      title: subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Η πληρωμή σου ολοκληρώθηκε</h2>
        <p>Καταβλήθηκε προκαταβολή <strong>${v.depositAmount || ''}€</strong> για το ραντεβού σου με το συνεργείο <strong>${v.garageName || ''}</strong> στις <strong>${v.appointmentDate || ''}</strong>.</p>
        <p><strong>Υπόλοιπο στο συνεργείο:</strong> ${v.remainingAmount || ''}€</p>
        <p>Μπορείς να δεις τις λεπτομέρειες στην εφαρμογή.</p>
      `,
      ctaLabel: 'Δες το ραντεβού',
      ctaUrl: link(`/requests/${v.clientId || ''}/details/${v.requestId || ''}`)
    })
    return { subject, html, text: htmlToPlainText(html) }
  },

  [EmailTemplate.CancellationConfirmationClient]: (v) => {
    const subject = 'Ακύρωση ραντεβού'
    const refundText = v.refundPoints
      ? `<p><strong>${v.refundPoints} πόντοι</strong> πιστώθηκαν στο πορτοφόλι σου.</p>`
      : '<p>Δεν δικαιούσαι επιστροφή πόντων για αυτή την ακύρωση.</p>'
    const html = baseLayout({
      title: subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Το ραντεβού σου ακυρώθηκε</h2>
        <p>Το ραντεβού σου με το συνεργείο <strong>${v.garageName || ''}</strong> στις <strong>${v.appointmentDate || ''}</strong> ακυρώθηκε.</p>
        ${refundText}
      `
    })
    return { subject, html, text: htmlToPlainText(html) }
  },

  [EmailTemplate.CancellationNotificationGarage]: (v) => {
    const subject = 'Ακύρωση ραντεβού πελάτη'
    const html = baseLayout({
      title: subject,
      bodyHtml: `
        <h2 style="margin:0 0 16px 0;font-size:20px;">Ακυρώθηκε ραντεβού</h2>
        <p>Ο πελάτης <strong>${v.clientName || ''}</strong> ακύρωσε το ραντεβού του στις <strong>${v.appointmentDate || ''}</strong>.</p>
        <p>Η ημερομηνία είναι πλέον διαθέσιμη στο πρόγραμμά σου.</p>
      `,
      ctaLabel: 'Άνοιγμα dashboard',
      ctaUrl: link(`/garage-dashboard/${v.garageId || ''}?tab=appointments`)
    })
    return { subject, html, text: htmlToPlainText(html) }
  },

  [EmailTemplate.AdminNewGarageValidation]: (v) => {
    const subject = `[Admin] Νέο συνεργείο για επιβεβαίωση: ${v.companyName || ''}`
    const html = baseLayout({
      title: subject,
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
    return { subject, html, text: htmlToPlainText(html) }
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
  return renderer(variables)
}
