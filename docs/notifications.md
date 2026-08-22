# Notifications Plan (Emails & SMS)

Αυτό το έγγραφο περιγράφει **πού** και **πότε** στέλνει notifications το NextService στους πελάτες, τα συνεργεία και τον admin.

**Βασικός κανόνας:** Τα emails είναι το **baseline** — δεν σταματούν ποτέ. Τα SMS μπαίνουν **από πάνω** σε συγκεκριμένα urgent touchpoints όταν ενεργοποιηθούν. Δεν αντικαθιστά το ένα το άλλο.

---

## 1. Πίνακας όλων των touchpoints (email + SMS)

✅ = στέλνεται σε αυτό το κανάλι. ❌ = δεν στέλνεται.

### Προς CLIENT (πελάτης)

| # | Πότε | Email | SMS | Σημειώσεις |
|---|---|---|---|---|
| 1 | Υπέβαλε request για service | ✅ | ❌ | Ο πελάτης μόλις ολοκλήρωσε action, ξέρει ότι έστειλε. Email αρκεί. |
| 2 | Έλαβε την **πρώτη** προσφορά για ένα request | ✅ | ✅ | Πρώτο engagement signal — push να γυρίσει στο app. Μόνο η πρώτη. |
| 3 | Έλαβε 2η, 3η, 4η… προσφορά | ✅ | ❌ | Το πρώτο SMS ήδη τον έφερε πίσω· τα επόμενα θα γίνονταν σπαμ. |
| 4 | Αποδέχτηκε προσφορά → ραντεβού | ✅ | ✅ | Κρίσιμη επιβεβαίωση με ημερομηνία, ώρα, ποσό. |
| 5 | Reminder ραντεβού **24 ώρες** πριν | ✅ | ✅ | SMS ~98% open rate vs ~20% email. Κρίσιμο για no-shows. |
| 6 | Reminder ραντεβού **2 ώρες** πριν | ❌ | ✅ | Το email δεν θα φτάσει εγκαίρως στο κινητό· εδώ μόνο SMS έχει νόημα. |
| 7 | Νέο chat message από συνεργείο | ✅ *(με debounce)* | ❌ | Βλ. εξήγηση debounce παρακάτω. |
| 8 | Ζήτησε επαναφορά κωδικού | ✅ | ❌ | Password reset link — μόνο email για security/paper trail. |
| 9 | Εγγραφή ξεχωριστά από request | ❌ | ❌ | Ο πελάτης σχεδόν πάντα εγγράφεται μαζί με το request, άρα παίρνει ήδη το confirmation. |

### Προς GARAGE (συνεργείο)

| # | Πότε | Email | SMS | Σημειώσεις |
|---|---|---|---|---|
| 10 | Μόλις εγγράφηκε | ✅ | ❌ | Περιμένει validation — δεν είναι επείγον. |
| 11 | Ο admin ενεργοποίησε τον λογαριασμό | ✅ | ❌ | Καλό να το μάθει, αλλά δεν είναι time-critical. |
| 12 | Ο πελάτης αποδέχτηκε την προσφορά του | ✅ | ✅ | **Κρίσιμο για τη δουλειά** — το συνεργείο πρέπει να οργανώσει το εργαστήριο αμέσως. |
| 13 | Reminder ραντεβού 24 ώρες πριν | ✅ | ✅ | Ίδιο σκεπτικό με τον πελάτη. |
| 14 | Νέο chat message από πελάτη | ✅ *(με debounce)* | ❌ | Βλ. εξήγηση debounce παρακάτω. |
| 15 | Ζήτησε επαναφορά κωδικού | ✅ | ❌ | Ίδιο με τον πελάτη. |
| 16 | "Υπάρχουν X νέα requests στην περιοχή σου" (weekly digest) | ✅ | ❌ | Non-urgent μαζική ενημέρωση — σίγουρα email μόνο. |

### Προς ADMIN (εσένα)

| # | Πότε | Email | SMS | Σημειώσεις |
|---|---|---|---|---|
| 17 | Νέο συνεργείο περιμένει validation | ✅ | ❌ | Θα τα βλέπεις και από το admin dashboard — το email είναι backup για να μη σου ξεφύγει. |

### SMS-only touchpoints (δεν έχουν email counterpart)

| # | Πότε | Παραλήπτης | Γιατί μόνο SMS |
|---|---|---|---|
| 18 | Κωδικός επαλήθευσης κινητού στο registration | client & garage | 2FA — πρέπει να πάει στο ίδιο το κινητό που δηλώνει ο χρήστης. Email θα ήταν phishing target. |
| 19 | Reminder 2h πριν το ραντεβού (βλ. #6) | client | Το email δεν φτάνει εγκαίρως. |

---

## 2. Τι είναι το "debounce" στα chat emails

Το chat δεν στέλνει email για κάθε μήνυμα — θα γινόταν σπαμ. Η λογική:

1. Έρχεται μήνυμα → στήνεται χρονοδιακόπτης 10 λεπτών, δεν στέλνουμε τίποτα ακόμα.
2. Έρχεται δεύτερο μήνυμα σε 20 δευτερόλεπτα → **μηδενίζουμε** τον χρονοδιακόπτη, ξαναρχίζει.
3. Όταν περάσουν 10 λεπτά **χωρίς νέο μήνυμα και χωρίς ο παραλήπτης να μπει στο app**, στέλνουμε **ένα** email: "Έχεις X νέα μηνύματα από τον Γιάννη."
4. Αν ο παραλήπτης είναι ήδη online και διαβάζει σε real-time (μέσω AppSync WebSocket), **δεν στέλνεται email καθόλου**.

**Αυτή η λογική δεν είναι ακόμα υλοποιημένη** — το template υπάρχει, το trigger είναι ανενεργό. Θα μπει σε επόμενο PR όταν θα έχουμε presence tracking + ένα scheduled job που σαρώνει "ποιος έχει unread πάνω από 10′".

---

## 3. Πόσα SMS περίπου ανά πλήρες deal (εκτίμηση κόστους)

Σε ένα τυπικό "client → request → προσφορές → αποδοχή → ραντεβού → ολοκλήρωση":

| Παραλήπτης | SMS | Πότε |
|---|---|---|
| Client | 4 | 1ο offer, offer accepted, reminder 24h, reminder 2h |
| Garage | 2 | offer accepted, reminder 24h |
| **Σύνολο** | **6 SMS** | ανά επιτυχημένο deal |

Στα €0.04–0.08/SMS (Twilio EU), αυτό βγαίνει **€0.24–0.48 ανά closed deal**. Για τη αξία που δίνει σε no-show reduction και engagement, αξίζει.

---

## 4. Τρέχουσα κατάσταση emails (Phase 1 — ενεργά τώρα)

Τα παρακάτω είναι ήδη ενεργοποιημένα στον κώδικα. Κάθε email αντιστοιχεί σε ένα template στο `src/lib/email-templates/` και ενεργοποιείται από ένα event στον πίνακα `EventLogs`.

| Touchpoint # | Trigger event | Template | Παραλήπτης |
|---|---|---|---|
| 1 | `service_request_submitted` | `request_confirmation` | client |
| 2, 3 | `offer_created` | `new_offer_received` | client |
| 4 | `offer_accepted` | `appointment_confirmation_client` | client |
| 8 | `password_reset_requested` (client) | `password_reset` | client |
| 10 | `garage_registered` | `welcome_garage` | garage |
| 11 | `garage_validated` | `garage_activated` | garage |
| 12 | `offer_accepted` | `offer_accepted_garage` | garage |
| 15 | `password_reset_requested` (garage) | `password_reset` | garage |
| 17 | `garage_registered` | `admin_new_garage_validation` | admin |

> Το admin email στέλνεται μόνο αν έχει οριστεί το env var `ADMIN_EMAIL`.

### Emails που δεν στέλνουμε ακόμα (Phase 2)

- **Touchpoints 5, 6, 13 (appointment reminders)** — χρειάζεται scheduled job. Η υποδομή υπάρχει πλέον: `infra/lambdas/appointment-completion-sweeper` + το EventBridge rule στο `notifications_stack.py` είναι το πρότυπο.
- **Touchpoints 7, 14 (chat messages με debounce)** — χρειάζεται presence detection + ουρά.
- **Touchpoint 16 (weekly digest)** — χρειάζεται scheduled job.

### Completion follow-up — υλοποιήθηκε

Το `appointment-completion-sweeper` Lambda τρέχει ωριαία, βρίσκει ραντεβού που
πέρασαν χωρίς να δηλωθεί τι έγινε (4 ώρες grace) και ζητά από το συνεργείο να
δηλώσει την ολοκλήρωση, το ποσό και την αξιολόγηση του πελάτη.

**Το email δεν είναι ο κύριος δίαυλος.** Το `NOTIFICATIONS_ENABLED` είναι
`false` στο production, οπότε το πραγματικό prompt είναι in-app: το
`/api/notifications/summary` επιστρέφει alerts `completion-due` (συνεργείο) και
`review-due` (και οι δύο πλευρές), τα οποία υπολογίζονται live χωρίς schedule.
Το Lambda είναι η out-of-band υπενθύμιση και είναι αυτό που γράφει το
`completionPromptedAt`, ώστε το email να φύγει ακριβώς μία φορά.

---

## 5. SMS Plan (Phase 2 — μόνο ανάλυση, καμία υλοποίηση)

### Γενική αρχή

Τα SMS είναι ακριβότερα και πιο ενοχλητικά από τα emails. Μπαίνουν **μόνο** σε touchpoints όπου ισχύει τουλάχιστον ένα από τα:

1. **Time-critical** — χρειάζεται αντίδραση σε λεπτά, όχι ώρες (reminders, confirmations ραντεβού)
2. **Κρίσιμο για τα χρήματα κάποιου** — π.χ. offer accepted στο συνεργείο
3. **2FA/security** — phone verification
4. **Πρώτο engagement signal** — η πρώτη προσφορά για πελάτη που μόλις έκανε request

### Πρόταση provider

| Provider | Pros | Cons |
|---|---|---|
| **AWS SNS** | Μένει στο AWS stack, φτηνό | Η ποιότητα delivery στην Ελλάδα είναι άστατη |
| **Twilio** | Καλύτερο deliverability σε EU, υποστηρίζει Viber/WhatsApp fallback | Πιο ακριβό ανά SMS |
| **Vonage/Nexmo** | Καλό για Ευρώπη | Λίγο πιο πολύπλοκο setup |

**Σύσταση:** Twilio για production. Πιο αξιόπιστο στην Ελλάδα και επιτρέπει να προστεθεί WhatsApp/Viber fallback χωρίς αλλαγή provider.

---

## 3. Τεχνικά (για μελλοντικό εαυτό)

### Πώς ενεργοποιείται το live email sending

Στο production/staging setting, βάλε στο environment:

```
NOTIFICATIONS_ENABLED=true                  # master switch — false ή absent = τίποτα δεν φεύγει
SES_FROM_ADDRESS=no-reply@nextservice.gr    # must be verified στο SES
SES_REGION=eu-central-1                     # fallback στο REGION
ADMIN_EMAIL=admin@nextservice.gr            # για τις admin notifications
NEXT_PUBLIC_APP_URL=https://nextservice.gr  # για τα CTA links στα emails
```

Στο local dev, άστα όλα default → `NOTIFICATIONS_ENABLED=false`. Τα emails γράφονται μόνο στο `EmailLogs` table με status `skipped`, δεν φεύγει τίποτα πουθενά. Αυτό το flag ελέγχει **όλα** τα notifications (email, SMS, push).

### Πώς βλέπεις τι στάλθηκε

Μέχρι να φτιάξουμε το admin app, μπορείς:

1. **Τοπικά**: άνοιξε το DynamoDB Admin UI (`http://localhost:8001` ενώ τρέχει το `npm run dynamodb`) → table `EmailLogs`.
2. **AWS**: DynamoDB console → table `EmailLogs` → Items tab. Φίλτρα ανά `to`, `templateName`, `status`.

Το admin app (ξεχωριστό Amplify project, αργότερα) θα κάνει query τα ίδια tables και θα δείχνει UI με filters, timelines, και counts.

### Πώς δημιουργούνται τα tables

**Αυτόματα.** Δεν χρειάζεται να τρέξεις τίποτα. Την πρώτη φορά που ο κώδικας προσπαθεί να γράψει σε ένα από τα δύο tables (`EventLogs`, `EmailLogs`), το `src/utils/ensureEventTables.ts` ελέγχει αν υπάρχει και το δημιουργεί μέσω του AWS SDK. Δουλεύει το ίδιο σε local DynamoDB και σε πραγματικό AWS — καμία διαφορά για εσένα. Η λειτουργία είναι cached ανά διεργασία, οπότε το describe-table τρέχει μόνο μία φορά.

### Files που εμπλέκονται

- `src/types/events.ts` — event names + email template names catalog
- `src/utils/eventLogger.ts` — γράφει events στο `EventLogs`
- `src/utils/emailService.ts` — στέλνει email μέσω SES + γράφει στο `EmailLogs`
- `src/utils/ensureEventTables.ts` — auto-create των tables την πρώτη φορά
- `src/lib/email-templates/index.ts` — HTML templates (ελληνικά)
- `src/lib/email-templates/baseLayout.ts` — κοινό branded wrapper

Κάθε φορά που θες να **προσθέσεις νέο email touchpoint**:

1. Αν χρειάζεσαι νέο event name: πρόσθεσέ το στο `EventName` enum στο `src/types/events.ts`.
2. Αν χρειάζεσαι νέο template: πρόσθεσέ το στο `EmailTemplate` enum και φτιάξε τον renderer στο `src/lib/email-templates/index.ts`.
3. Στο αντίστοιχο API route, κάλεσε `logEvent({...})` και `sendEmail({...})` μετά το επιτυχές DB write.
4. Ανανέωσε αυτό το αρχείο.
