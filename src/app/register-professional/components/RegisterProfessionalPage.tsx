'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HiBuildingOffice2, HiMapPin, HiPhone, HiEnvelope, HiWrenchScrewdriver, HiCheckCircle } from 'react-icons/hi2'
import { useToast } from '@/hooks/useToast'
import { styles } from '@/styles/styles'
import { Input, Card, Button } from '@/components'

interface GarageFormData {
  companyName: string
  tin: string
  email: string
  taxAuthority: string
  address: string
  mobile: string
}

export default function RegisterProfessionalPage() {
  const [formData, setFormData] = useState<GarageFormData>({
    companyName: '',
    tin: '',
    email: '',
    taxAuthority: '',
    address: '',
    mobile: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  
  const router = useRouter()
  const { success, error } = useToast()


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
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.ok && data.success) {
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-full max-w-md mx-auto px-4">
          <Card className="py-8 px-6 text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
              <HiCheckCircle className="h-8 w-8 text-green-600" />
            </div>
            
            <h2 className={`${styles.pageTitle} mb-4`}>
              Εγγραφή Ολοκληρώθηκε!
            </h2>
            
            <p className={`${styles.bodyText} mb-6`}>
              Η εταιρεία <strong>{formData.companyName}</strong> εγγράφηκε επιτυχώς στο σύστημά μας.
              Θα επικοινωνήσουμε μαζί σας σύντομα για να ενεργοποιήσουμε τον λογαριασμό σας.
            </p>
            
            <div className="space-y-3">
              <Button
                onClick={() => router.push('/')}
                className="w-full"
                variant="primary"
              >
                Επιστροφή στην Αρχική
              </Button>
              
              <Button
                  onClick={() => {
                    setIsSubmitted(false)
                    setFormData({
                      companyName: '',
                      tin: '',
                      email: '',
                      taxAuthority: '',
                      address: '',
                      mobile: ''
                    })
                  }}
                className="w-full"
                variant="secondary"
              >
                Νέα Εγγραφή
              </Button>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`${styles.pageTitle} mb-2`}>
                Εγγραφή Εταιρείας
              </h1>
              <p className={styles.bodyText}>
                Εγγραφείτε ως επαγγελματική εταιρεία για να προσφέρετε υπηρεσίες στους πελάτες μας
              </p>
            </div>
            <div className="hidden md:block">
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-blue-100">
                <HiBuildingOffice2 className="h-8 w-8 text-blue-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card className="p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Information */}
            <div className="space-y-6">
              <div className="flex items-center space-x-3 mb-6">
                <HiBuildingOffice2 className="h-6 w-6 text-blue-600" />
                <h2 className={`${styles.sectionTitle}`}>
                  Βασικές Πληροφορίες
                </h2>
              </div>

              <div>
                <label className={`${styles.label} block mb-2`}>
                  Επωνυμία Εταιρείας *
                </label>
                <Input
                  type="text"
                  value={formData.companyName}
                  onChange={(value) => handleInputChange('companyName', value)}
                  placeholder="π.χ. ΑΕ Συνεργείο Αυτοκινήτων Παπαδόπουλος"
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className={`${styles.label} block mb-2`}>
                  ΑΦΜ *
                </label>
                <Input
                  type="text"
                  value={formData.tin}
                  onChange={(value) => handleInputChange('tin', value)}
                  placeholder="π.χ. 123456789"
                  required
                  disabled={isLoading}
                  maxLength={9}
                />
              </div>

              <div>
                <label className={`${styles.label} block mb-2`}>
                  Email *
                </label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(value) => handleInputChange('email', value)}
                  placeholder="π.χ. info@company.gr"
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className={`${styles.label} block mb-2`}>
                  ΔΟΥ *
                </label>
                <Input
                  type="text"
                  value={formData.taxAuthority}
                  onChange={(value) => handleInputChange('taxAuthority', value)}
                  placeholder="π.χ. ΔΟΥ Αθηνών"
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className={`${styles.label} block mb-2`}>
                  Διεύθυνση *
                </label>
                <Input
                  type="text"
                  value={formData.address}
                  onChange={(value) => handleInputChange('address', value)}
                  placeholder="π.χ. Λεωφόρος Πατησιών 123, Αθήνα"
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className={`${styles.label} block mb-2`}>
                  Κινητό Τηλέφωνο *
                </label>
                <Input
                  type="tel"
                  value={formData.mobile}
                  onChange={(value) => handleInputChange('mobile', value)}
                  placeholder="π.χ. 6971234567 ή +30 6971234567"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>


            {/* Submit Button */}
            <div className="pt-6 border-t border-gray-200">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                loading={isLoading}
              >
                Εγγραφή Εταιρείας
              </Button>
            </div>
          </form>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className={styles.smallText}>
            Έχετε ήδη λογαριασμό;{' '}
            <button
              onClick={() => router.push('/')}
              className={`font-medium ${styles.linkText}`}
            >
              Επιστροφή στην Αρχική
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
