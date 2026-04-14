'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { useToast } from '@/hooks/useToast'
import { styles } from '@/styles/styles'

const extraServices = [
  { icon: 'car_rental', label: 'Όχημα Αντικατάστασης', value: 'replacement-vehicle' },
  { icon: 'local_shipping', label: 'Παραλαβή από το σπίτι', value: 'home-pickup' },
  { icon: 'local_shipping', label: 'Παράδοση στο σπίτι', value: 'home-delivery' },
  { icon: 'credit_card', label: 'Πληρωμή με κάρτα', value: 'card-payment' },
  { icon: 'receipt_long', label: 'Δωρεάν Εγγύηση Εργασίας', value: 'work-warranty' },
  { icon: 'schedule', label: 'Εξυπηρέτηση Σαββατοκύριακο', value: 'weekend-service' },
]

interface GarageFormData {
  companyName: string
  contactFirstName: string
  contactLastName: string
  tin: string
  email: string
  taxAuthority: string
  address: string
  mobile: string
}

export default function RegisterProfessionalPage() {
  const [formData, setFormData] = useState<GarageFormData>({
    companyName: '',
    contactFirstName: '',
    contactLastName: '',
    tin: '',
    email: '',
    taxAuthority: '',
    address: '',
    mobile: ''
  })
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswordFields, setShowPasswordFields] = useState(true)
  const [emailLocked, setEmailLocked] = useState(false)
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [customServices, setCustomServices] = useState<string[]>([])
  const [customServiceInput, setCustomServiceInput] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const router = useRouter()
  const { success, error } = useToast()

  useEffect(() => {
    const savedEmail = sessionStorage.getItem('garageRegEmail')
    const savedPassword = sessionStorage.getItem('garageRegPassword')
    if (savedEmail) {
      setFormData(prev => ({ ...prev, email: savedEmail }))
      setEmailLocked(true)
    }
    if (savedPassword) {
      setPassword(savedPassword)
      setShowPasswordFields(false)
    }
    // Never pre-check the terms checkbox — GDPR requires explicit consent
    // on each form, regardless of what the user accepted elsewhere.
  }, [])


  const handleInputChange = (field: keyof GarageFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }


  const validateForm = (): boolean => {
    if (!formData.companyName.trim()) {
      error('Σφάλμα', 'Η επωνυμία της εταιρείας είναι υποχρεωτική')
      return false
    }

    if (!formData.contactFirstName.trim()) {
      error('Σφάλμα', 'Το όνομα υπεύθυνου είναι υποχρεωτικό')
      return false
    }

    if (!formData.contactLastName.trim()) {
      error('Σφάλμα', 'Το επώνυμο υπεύθυνου είναι υποχρεωτικό')
      return false
    }

    if (!formData.tin.trim()) {
      error('Σφάλμα', 'Ο ΑΦΜ είναι υποχρεωτικός')
      return false
    }

    if (!formData.email.trim()) {
      error('Σφάλμα', 'Το email είναι υποχρεωτικό')
      return false
    }

    if (!formData.taxAuthority.trim()) {
      error('Σφάλμα', 'Η ΔΟΥ είναι υποχρεωτική')
      return false
    }

    if (!formData.address.trim()) {
      error('Σφάλμα', 'Η διεύθυνση είναι υποχρεωτική')
      return false
    }

    if (!formData.mobile.trim()) {
      error('Σφάλμα', 'Ο αριθμός κινητού είναι υποχρεωτικός')
      return false
    }


    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      error('Σφάλμα', 'Παρακαλώ εισάγετε ένα έγκυρο email')
      return false
    }

    // TIN validation (Greek format - 9 digits)
    const tinRegex = /^[0-9]{9}$/
    if (!tinRegex.test(formData.tin.replace(/\s/g, ''))) {
      error('Σφάλμα', 'Ο ΑΦΜ πρέπει να είναι 9 ψηφία')
      return false
    }

    // Mobile validation (Greek format)
    const mobileRegex = /^(\+30|0)?[0-9]{10}$/
    if (!mobileRegex.test(formData.mobile.replace(/\s/g, ''))) {
      error('Σφάλμα', 'Παρακαλώ εισάγετε ένα έγκυρο αριθμό κινητού')
      return false
    }

    if (showPasswordFields) {
      if (!password || password.length < 6) {
        error('Σφάλμα', 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες')
        return false
      }
      if (password !== confirmPassword) {
        error('Σφάλμα', 'Οι κωδικοί δεν ταιριάζουν')
        return false
      }
    }

    if (!acceptedTerms) {
      error('Σφάλμα', 'Πρέπει να αποδεχτείτε τους Όρους Χρήσης και την Πολιτική Απορρήτου')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/register-professional', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          password,
          services: [...selectedServices, ...customServices],
          acceptedTerms: true
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        sessionStorage.removeItem('garageRegEmail')
        sessionStorage.removeItem('garageRegPassword')
        setIsSubmitted(true)
        success('Επιτυχής Εγγραφή', 'Το συνεργείο σας εγγράφηκε επιτυχώς! Θα επικοινωνήσουμε μαζί σας σύντομα.')
      } else {
        error('Σφάλμα Εγγραφής', data.error || 'Δεν ήταν δυνατή η εγγραφή του συνεργείου')
      }
    } catch (err) {
      console.error('Registration error:', err)
      error('Σφάλμα Εγγραφής', 'Δεν ήταν δυνατή η εγγραφή. Παρακαλώ δοκιμάστε ξανά.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-50 mb-6">
              <Icon name="check_circle" filled className="text-green-600" size="xl" />
            </div>

            <h2 className="text-2xl font-black tracking-tight text-on-surface mb-4">
              Εγγραφή Ολοκληρώθηκε!
            </h2>

            <p className={`${styles.bodyText} mb-8`}>
              Η εταιρεία <strong className="text-on-surface">{formData.companyName}</strong> εγγράφηκε επιτυχώς στο σύστημά μας.
              Θα επικοινωνήσουμε μαζί σας σύντομα για να ενεργοποιήσουμε τον λογαριασμό σας.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => router.push('/')}
                className={`${styles.btnPrimary} w-full justify-center py-3.5`}
              >
                <Icon name="home" size="sm" />
                Επιστροφή στην Αρχική
              </button>

              <button
                onClick={() => {
                  setIsSubmitted(false)
                  setFormData({
                    companyName: '',
                    contactFirstName: '',
                    contactLastName: '',
                    tin: '',
                    email: '',
                    taxAuthority: '',
                    address: '',
                    mobile: ''
                  })
                  setSelectedServices([])
                  setCustomServices([])
                  setCustomServiceInput('')
                }}
                className={`${styles.btnOutline} w-full justify-center py-3.5`}
              >
                <Icon name="add" size="sm" />
                Νέα Εγγραφή
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const formFields: { key: keyof GarageFormData; label: string; icon: string; type: string; placeholder: string; maxLength?: number }[] = [
    { key: 'companyName', label: 'Επωνυμία Εταιρείας', icon: 'business', type: 'text', placeholder: 'π.χ. ΑΕ Συνεργείο Αυτοκινήτων Παπαδόπουλος' },
    { key: 'contactFirstName', label: 'Όνομα Υπεύθυνου', icon: 'person', type: 'text', placeholder: 'π.χ. Γιώργος' },
    { key: 'contactLastName', label: 'Επώνυμο Υπεύθυνου', icon: 'person', type: 'text', placeholder: 'π.χ. Παπαδόπουλος' },
    { key: 'tin', label: 'ΑΦΜ', icon: 'pin', type: 'text', placeholder: 'π.χ. 123456789', maxLength: 9 },
    { key: 'email', label: 'Email', icon: 'mail', type: 'email', placeholder: 'π.χ. info@company.gr' },
    { key: 'taxAuthority', label: 'ΔΟΥ', icon: 'account_balance', type: 'text', placeholder: 'π.χ. ΔΟΥ Αθηνών' },
    { key: 'address', label: 'Διεύθυνση', icon: 'location_on', type: 'text', placeholder: 'π.χ. Λεωφόρος Πατησιών 123, Αθήνα' },
    { key: 'mobile', label: 'Κινητό Τηλέφωνο', icon: 'phone_iphone', type: 'tel', placeholder: 'π.χ. 6971234567 ή +30 6971234567' },
  ]

  const toggleService = (value: string) => {
    setSelectedServices(prev =>
      prev.includes(value)
        ? prev.filter(s => s !== value)
        : [...prev, value]
    )
  }

  const addCustomService = () => {
    const trimmed = customServiceInput.trim()
    if (trimmed && !customServices.includes(trimmed)) {
      setCustomServices(prev => [...prev, trimmed])
      setCustomServiceInput('')
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="bg-surface-container-lowest border-b border-outline-variant/10">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-on-surface mb-2">
                Εγγραφή Εταιρείας
              </h1>
              <p className={styles.bodyText}>
                Εγγραφείτε ως επαγγελματική εταιρεία για να προσφέρετε υπηρεσίες στους πελάτες μας
              </p>
            </div>
            <div className="hidden md:block">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary-container rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
                <Icon name="business" filled className="text-on-primary" size="lg" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Requirements Info Card */}
        <div className="bg-surface-container-low rounded-xl p-5 mb-6 flex items-start gap-3">
          <Icon name="info" filled className="text-primary mt-0.5" />
          <div>
            <p className="text-sm font-bold text-on-surface mb-1">Απαιτούμενα στοιχεία</p>
            <p className="text-xs text-secondary leading-relaxed">
              Ολα τα πεδία είναι υποχρεωτικά. Ο ΑΦΜ πρέπει να είναι 9 ψηφία και ο αριθμός κινητού σε ελληνικό format.
            </p>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Section Header */}
            <div className="flex items-center gap-3 pb-4 border-b border-outline-variant/10">
              <div className="w-10 h-10 bg-surface-container rounded-lg flex items-center justify-center">
                <Icon name="business" filled className="text-primary" />
              </div>
              <h2 className={styles.sectionTitle}>
                Βασικές Πληροφορίες
              </h2>
            </div>

            {/* Form Fields */}
            <div className="space-y-5">
              {formFields.map((field) => {
                const isEmailField = field.key === 'email'
                const isLocked = isEmailField && emailLocked
                return (
                  <div key={field.key} className="space-y-2">
                    <label className={`${styles.labelUpper} flex items-center gap-2`}>
                      <Icon name={field.icon} size="sm" className="text-on-surface-variant" />
                      {field.label} *
                      {isLocked && <Icon name="lock" size="sm" className="text-on-surface-variant/50" />}
                    </label>
                    <input
                      type={field.type}
                      value={formData[field.key]}
                      onChange={(e) => handleInputChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      required
                      disabled={isLoading || isLocked}
                      readOnly={isLocked}
                      maxLength={field.maxLength}
                      className={`${styles.input} ${isLoading ? 'opacity-50' : ''} ${isLocked ? 'opacity-60 cursor-not-allowed bg-surface-container' : ''}`}
                    />
                  </div>
                )
              })}

              {showPasswordFields && (
                <>
                  <div className="space-y-2">
                    <label className={`${styles.labelUpper} flex items-center gap-2`}>
                      <Icon name="lock" size="sm" className="text-on-surface-variant" />
                      Κωδικός Πρόσβασης *
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Τουλάχιστον 6 χαρακτήρες"
                      required
                      disabled={isLoading}
                      className={`${styles.input} ${isLoading ? 'opacity-50' : ''}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className={`${styles.labelUpper} flex items-center gap-2`}>
                      <Icon name="lock" size="sm" className="text-on-surface-variant" />
                      Επιβεβαίωση Κωδικού *
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Επαναλάβετε τον κωδικό"
                      required
                      disabled={isLoading}
                      className={`${styles.input} ${isLoading ? 'opacity-50' : ''}`}
                    />
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-xs text-error">Οι κωδικοί δεν ταιριάζουν</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Extra Services Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-outline-variant/10">
                <div className="w-10 h-10 bg-surface-container rounded-lg flex items-center justify-center">
                  <Icon name="star" filled className="text-primary" />
                </div>
                <div>
                  <h2 className={styles.sectionTitle}>
                    Επιπλέον Υπηρεσίες
                  </h2>
                  <p className="text-xs text-on-surface-variant">Τι extra προσφέρετε στους πελάτες σας; (προαιρετικό)</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {extraServices.map((service) => {
                  const isSelected = selectedServices.includes(service.value)
                  return (
                    <button
                      key={service.value}
                      type="button"
                      onClick={() => toggleService(service.value)}
                      className={`flex items-center gap-2 p-3 rounded-xl text-left transition-all ${
                        isSelected
                          ? 'bg-primary/10 border-2 border-primary'
                          : 'bg-surface-container border-2 border-transparent hover:bg-surface-container-high'
                      }`}
                    >
                      <Icon
                        name={service.icon}
                        size="sm"
                        className={isSelected ? 'text-primary' : 'text-on-surface-variant/60'}
                      />
                      <span className={`text-xs font-bold ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                        {service.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Custom services */}
              {customServices.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customServices.map((cs) => (
                    <div key={cs} className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5">
                      <span className="text-xs font-bold text-primary">{cs}</span>
                      <button
                        type="button"
                        onClick={() => setCustomServices(prev => prev.filter(s => s !== cs))}
                        className="text-primary/60 hover:text-primary"
                      >
                        <Icon name="close" size="sm" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add custom service input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customServiceInput}
                  onChange={(e) => setCustomServiceInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomService() } }}
                  placeholder="Προσθέστε δική σας υπηρεσία..."
                  className={`${styles.input} flex-1`}
                />
                <button
                  type="button"
                  onClick={addCustomService}
                  disabled={!customServiceInput.trim()}
                  className="px-4 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-30 transition-opacity"
                >
                  <Icon name="add" size="sm" />
                </button>
              </div>
            </div>

            {/* Consent — required for GDPR */}
            <div className="pt-6 border-t border-outline-variant/10">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                />
                <span className="text-xs text-on-surface-variant leading-snug">
                  Έχω διαβάσει και αποδέχομαι τους{' '}
                  <Link href="/terms" target="_blank" className="text-primary underline">
                    Όρους Χρήσης
                  </Link>
                  {' '}και την{' '}
                  <Link href="/privacy" target="_blank" className="text-primary underline">
                    Πολιτική Απορρήτου
                  </Link>
                  . Αναγνωρίζω ότι τα στοιχεία επικοινωνίας των πελατών είναι εμπιστευτικά και θα χρησιμοποιηθούν αποκλειστικά για το συγκεκριμένο αίτημα service.
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={isLoading}
                className={`${styles.btnPrimary} w-full justify-center py-4 text-base ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Icon name="how_to_reg" size="sm" />
                {isLoading ? 'Εγγραφή...' : 'Εγγραφή Εταιρείας'}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className={styles.smallText}>
            Έχετε ήδη λογαριασμό;{' '}
            <button
              onClick={() => router.push('/')}
              className={styles.linkText}
            >
              Επιστροφή στην Αρχική
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
