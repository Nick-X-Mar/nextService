'use client'

import { useState } from 'react'
import { Input, Spinner } from '@/components'
import InlineNudge from '@/components/InlineNudge'
import AccountDangerZone from '@/components/AccountDangerZone'
import NotificationSettings from './NotificationSettings'
import { styles } from '@/styles/styles'
import { useToast } from '@/hooks/useToast'
import Icon from '@/components/ui/Icon'

interface GarageData {
  id: string
  companyName: string
  email: string
  mobile: string
  address: string
  tin: string
  taxAuthority: string
  description?: string
  /** "HH:MM" — when the shop opens, shown to clients with each available date. */
  workdayStartTime?: string
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

      const response = await fetch(`/api/garage/${formData.id}/`, {
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
        success('Επιτυχης Ενημερωση', 'Τα στοιχεια του συνεργειου ενημερωθηκαν επιτυχως!')
      } else {
        throw new Error(data.error || 'Failed to update garage data')
      }
    } catch (err) {
      console.error('Error updating garage data:', err)
      error('Σφαλμα', err instanceof Error ? err.message : 'Δεν ηταν δυνατη η ενημερωση των στοιχειων. Παρακαλω δοκιμαστε ξανα.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setFormData(garageData)
    setHasChanges(false)
  }

  const infoFields = [
    { icon: 'business', label: 'ΕΠΩΝΥΜΙΑ', field: 'companyName' as keyof GarageData, placeholder: 'π.χ. Συνεργειο Παπαδοπουλος', required: true },
    { icon: 'receipt_long', label: 'ΑΦΜ', field: 'tin' as keyof GarageData, placeholder: '123456789', required: true },
    { icon: 'mail', label: 'EMAIL', field: 'email' as keyof GarageData, placeholder: 'info@garage.gr', required: true, type: 'email' },
    { icon: 'phone', label: 'ΤΗΛΕΦΩΝΟ', field: 'mobile' as keyof GarageData, placeholder: '+306984959044', required: true },
    { icon: 'location_on', label: 'ΔΙΕΥΘΥΝΣΗ', field: 'address' as keyof GarageData, placeholder: 'Λεωφορος Πατησιων 123, Αθηνα', required: true, fullWidth: true },
    { icon: 'account_balance', label: 'ΔΟΥ', field: 'taxAuthority' as keyof GarageData, placeholder: 'ΔΟΥ Αθηνων', required: true },
    // Shown to the customer next to every date this shop offers, so "Τρίτη 12/9"
    // reads as "Τρίτη 12/9, από τις 09:00".
    { icon: 'schedule', label: 'ΩΡΑ ΕΝΑΡΞΗΣ ΕΡΓΑΣΙΩΝ', field: 'workdayStartTime' as keyof GarageData, placeholder: '09:00', required: false, type: 'time' },
    { icon: 'description', label: 'ΠΕΡΙΓΡΑΦΗ', field: 'description' as keyof GarageData, placeholder: 'Συντομη περιγραφη του συνεργειου...', required: false },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-on-surface">
          Προφιλ Συνεργειου
        </h2>
        <p className="text-base text-secondary leading-relaxed mt-1">
          Διαχειριστειτε τα στοιχεια του συνεργειου σας
        </p>
      </div>

      <InlineNudge
        when={!formData.description?.trim() || (formData.benefits?.length ?? 0) === 0}
        icon="storefront"
        title="Το προφίλ σου είναι ελλιπές"
        detail="Οι πελάτες βλέπουν την περιγραφή και τις παροχές σου δίπλα στην προσφορά. Χωρίς αυτές, η προσφορά σου συγκρίνεται μόνο με την τιμή."
      />

      {/* Company Information */}
      <article className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center h-14 w-14 rounded-full bg-surface-container text-primary">
            <Icon name="business" filled size="md" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-on-surface">Στοιχεια Εταιρειας</h3>
            <p className="text-xs text-secondary">Βασικα στοιχεια επικοινωνιας</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {infoFields.map((item) => (
            <div key={item.field} className={item.fullWidth ? 'md:col-span-2' : ''}>
              <div className="flex items-center gap-2 mb-2">
                <Icon name={item.icon} size="sm" className="text-primary" />
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                  {item.label} {item.required && '*'}
                </label>
              </div>
              <Input
                type={(item.type || 'text') as 'text' | 'email' | 'tel' | 'number' | 'time'}
                value={(formData[item.field] as string) || ''}
                onChange={(value) => handleInputChange(item.field, value)}
                placeholder={item.placeholder}
                required={item.required}
              />
            </div>
          ))}
        </div>
      </article>

      {/* Benefits / Free Services */}
      <article className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center h-14 w-14 rounded-full bg-surface-container text-primary">
            <Icon name="star" filled size="md" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-on-surface">Παροχες Εργασιας</h3>
            <p className="text-xs text-secondary">Δωρεαν παροχες για τους πελατες σας</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                value={newBenefit}
                onChange={(value) => setNewBenefit(value)}
                placeholder="π.χ. Δωρεαν διαγνωστικη"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddBenefit()
                  }
                }}
              />
            </div>
            <button
              onClick={handleAddBenefit}
              disabled={!newBenefit.trim()}
              className={newBenefit.trim() ? styles.btnPrimary : styles.btnDisabled}
            >
              <Icon name="add" size="sm" />
              Προσθηκη
            </button>
          </div>
        </div>

        {/* Benefits List */}
        <div className="space-y-2">
          {formData.benefits && formData.benefits.length > 0 ? (
            formData.benefits.map((benefit, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl group">
                <div className="flex items-center gap-3">
                  <Icon name="check_circle" filled size="sm" className="text-green-600" />
                  <span className="text-sm font-medium text-on-surface">{benefit}</span>
                </div>
                <button
                  onClick={() => handleRemoveBenefit(index)}
                  className="text-tertiary hover:text-tertiary/80 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                >
                  <Icon name="close" size="sm" />
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-6">
              <Icon name="inventory_2" size="lg" className="text-outline/40 mx-auto mb-2" />
              <p className="text-sm text-on-surface-variant italic">
                Δεν εχουν προστεθει παροχες ακομα
              </p>
            </div>
          )}
        </div>
      </article>

      {/* Unsaved Changes Bar */}
      {hasChanges && (
        <div className="sticky bottom-4 z-10">
          <div className="bg-gradient-to-br from-primary to-primary-container rounded-xl p-4 shadow-xl shadow-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Icon name="edit_note" size="md" className="text-on-primary" />
                <div>
                  <p className="text-sm font-bold text-on-primary">Μη αποθηκευμενες αλλαγες</p>
                  <p className="text-xs text-on-primary/70">Αποθηκευστε τις αλλαγες σας</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-on-primary/80 hover:bg-white/10 transition-colors"
                >
                  Ακυρωση
                </button>
                <button
                  onClick={handleSave}
                  disabled={isLoading}
                  className="px-5 py-2 bg-surface-container-lowest text-primary rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Spinner size="sm" />
                      Αποθηκευση...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Icon name="save" size="sm" />
                      Αποθηκευση
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Information Card */}
      <article className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-primary/10 bg-primary/[0.03]">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <Icon name="info" size="sm" className="text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-on-surface mb-2">
              Σημαντικες Πληροφοριες
            </h4>
            <ul className="space-y-1.5">
              {[
                'Τα πεδια με * ειναι υποχρεωτικα',
                'Το ΑΦΜ πρεπει να ειναι 9 ψηφια',
                'Το email θα χρησιμοποιηθει για ειδοποιησεις',
                'Το κινητο τηλεφωνο θα χρησιμοποιηθει για SMS'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Icon name="check" size="sm" className="text-primary" />
                  <span className="text-sm text-on-surface-variant">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </article>

      <NotificationSettings />

      {/* GDPR Danger Zone */}
      <AccountDangerZone userId={garageData.id} userType="garage" />
    </div>
  )
}
