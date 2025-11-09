'use client'

import { useState } from 'react'
import { Card, Input, Button } from '@/components'
import { styles } from '@/styles/styles'
import { useToast } from '@/hooks/useToast'

interface GarageData {
  id: string
  companyName: string
  email: string
  mobile: string
  address: string
  tin: string
  taxAuthority: string
  description?: string
  benefits?: string[]
}

interface GarageSettingsProps {
  garageData: GarageData
  onUpdate: (data: GarageData) => void
}

export default function GarageSettings({ garageData, onUpdate }: GarageSettingsProps) {
  const [formData, setFormData] = useState<GarageData>(garageData)
  const [isLoading, setIsLoading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [newBenefit, setNewBenefit] = useState('')
  const { success, error } = useToast()

  const handleInputChange = (field: keyof GarageData, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    setHasChanges(true)
  }

  const handleAddBenefit = () => {
    if (newBenefit.trim()) {
      const updatedBenefits = [...(formData.benefits || []), newBenefit.trim()]
      setFormData(prev => ({
        ...prev,
        benefits: updatedBenefits
      }))
      setNewBenefit('')
      setHasChanges(true)
    }
  }

  const handleRemoveBenefit = (index: number) => {
    const updatedBenefits = (formData.benefits || []).filter((_, i) => i !== index)
    setFormData(prev => ({
      ...prev,
      benefits: updatedBenefits
    }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    try {
      setIsLoading(true)
      
      const response = await fetch(`/api/garage/${formData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update garage data')
      }
      
      const data = await response.json()
      
      if (data.success) {
        onUpdate(data.garage)
        setHasChanges(false)
        success('Επιτυχής Ενημέρωση', 'Τα στοιχεία του συνεργείου ενημερώθηκαν επιτυχώς!')
      } else {
        throw new Error(data.error || 'Failed to update garage data')
      }
    } catch (err) {
      console.error('Error updating garage data:', err)
      error('Σφάλμα', err instanceof Error ? err.message : 'Δεν ήταν δυνατή η ενημέρωση των στοιχείων. Παρακαλώ δοκιμάστε ξανά.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setFormData(garageData)
    setHasChanges(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className={`${styles.sectionTitle} mb-2`}>
          Ρυθμίσεις Συνεργείου
        </h2>
        <p className={styles.bodyText}>
          Διαχειριστείτε τα στοιχεία και τις ρυθμίσεις του συνεργείου σας
        </p>
      </div>

      {/* Company Information */}
      <Card className="p-6">
        <h3 className={`${styles.sectionTitle} mb-4`}>
          Στοιχεία Εταιρείας
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={`${styles.label} block mb-2`}>
              Επωνυμία Εταιρείας *
            </label>
            <Input
              value={formData.companyName}
              onChange={(value) => handleInputChange('companyName', value)}
              placeholder="π.χ. ΑΕ Συνεργείο Αυτοκινήτων Παπαδόπουλος"
              required
            />
          </div>

          <div>
            <label className={`${styles.label} block mb-2`}>
              ΑΦΜ *
            </label>
            <Input
              value={formData.tin}
              onChange={(value) => handleInputChange('tin', value)}
              placeholder="123456789"
              required
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
              placeholder="info@garage.gr"
              required
            />
          </div>

          <div>
            <label className={`${styles.label} block mb-2`}>
              Κινητό Τηλέφωνο *
            </label>
            <Input
              value={formData.mobile}
              onChange={(value) => handleInputChange('mobile', value)}
              placeholder="+306984959044"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className={`${styles.label} block mb-2`}>
              Διεύθυνση *
            </label>
            <Input
              value={formData.address}
              onChange={(value) => handleInputChange('address', value)}
              placeholder="Λεωφόρος Πατησιών 123, Αθήνα"
              required
            />
          </div>

          <div>
            <label className={`${styles.label} block mb-2`}>
              ΔΟΥ *
            </label>
            <Input
              value={formData.taxAuthority}
              onChange={(value) => handleInputChange('taxAuthority', value)}
              placeholder="ΔΟΥ Αθηνών"
              required
            />
          </div>

          <div>
            <label className={`${styles.label} block mb-2`}>
              Περιγραφή
            </label>
            <Input
              value={formData.description || ''}
              onChange={(value) => handleInputChange('description', value)}
              placeholder="Σύντομη περιγραφή του συνεργείου..."
            />
          </div>
        </div>
      </Card>

      {/* Benefits Management */}
      <Card className="p-6">
        <h3 className={`${styles.sectionTitle} mb-4`}>
          Παροχές Εργασίας
        </h3>
        
        <div className="mb-4">
          <label className={`${styles.label} block mb-2`}>
            Δωρεάν Παροχές
          </label>
          <p className={`${styles.smallText} text-gray-600 mb-3`}>
            Προσθέστε τις δωρεάν παροχές που προσφέρετε στους πελάτες σας
          </p>
          
          <div className="flex gap-2 mb-4">
            <Input
              value={newBenefit}
              onChange={(value) => setNewBenefit(value)}
              placeholder="π.χ. Δωρεάν διαγνωστική"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddBenefit()
                }
              }}
            />
            <Button
              variant="primary"
              onClick={handleAddBenefit}
              disabled={!newBenefit.trim()}
            >
              Προσθήκη
            </Button>
          </div>
        </div>

        {/* Benefits List */}
        <div className="space-y-2">
          {formData.benefits && formData.benefits.length > 0 ? (
            formData.benefits.map((benefit, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className={styles.bodyText}>{benefit}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRemoveBenefit(index)}
                  className="text-red-600 hover:text-red-700"
                >
                  Αφαίρεση
                </Button>
              </div>
            ))
          ) : (
            <p className={`${styles.smallText} text-gray-500 italic`}>
              Δεν έχουν προστεθεί παροχές ακόμα
            </p>
          )}
        </div>
      </Card>

      {/* Action Buttons */}
      {hasChanges && (
        <Card className="p-6 bg-orange-50 border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`${styles.label} mb-1`}>
                Έχετε μη αποθηκευμένες αλλαγές
              </h4>
              <p className={styles.smallText}>
                Κάντε κλικ στο "Αποθήκευση" για να αποθηκεύσετε τις αλλαγές σας
              </p>
            </div>
            <div className="flex space-x-3">
              <Button
                variant="secondary"
                onClick={handleReset}
                disabled={isLoading}
              >
                Ακύρωση
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                loading={isLoading}
              >
                Αποθήκευση
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Information Card */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <div className="flex items-start space-x-3">
          <div className="text-blue-500 mt-1">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h4 className={`${styles.label} mb-1`}>
              Σημαντικές Πληροφορίες
            </h4>
            <ul className={`${styles.smallText} space-y-1`}>
              <li>• Τα πεδία με * είναι υποχρεωτικά</li>
              <li>• Το ΑΦΜ πρέπει να είναι 9 ψηφία</li>
              <li>• Το email θα χρησιμοποιηθεί για ειδοποιήσεις</li>
              <li>• Το κινητό τηλέφωνο θα χρησιμοποιηθεί για SMS</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}
