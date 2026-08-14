'use client'

import { useState, useEffect } from 'react'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { styles } from '../../../../styles/styles'

interface Client {
  id: string
  firstName: string
  lastName?: string
  email?: string
  phoneNumber?: string
  address?: string
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

interface UserInfoSectionProps {
  client: Client
  onUpdate: (updatedClient: Partial<Client>) => Promise<boolean>
}

export default function UserInfoSection({ client, onUpdate }: UserInfoSectionProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    firstName: client.firstName || '',
    lastName: client.lastName || '',
    email: client.email || '',
    phoneNumber: client.phoneNumber || '',
    address: client.address || '',
  })

  // Update form data when client data changes
  useEffect(() => {
    setFormData({
      firstName: client.firstName || '',
      lastName: client.lastName || '',
      email: client.email || '',
      phoneNumber: client.phoneNumber || '',
      address: client.address || '',
    })
  }, [client])

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSave = async () => {
    setIsSubmitting(true)
    try {
      const success = await onUpdate(formData)
      if (success) {
        setIsEditing(false)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      firstName: client.firstName || '',
      lastName: client.lastName || '',
      email: client.email || '',
      phoneNumber: client.phoneNumber || '',
      address: client.address || '',
    })
    setIsEditing(false)
  }

  const fields: { key: keyof typeof formData; label: string; icon: string; type: string; placeholder: string; colSpan?: boolean }[] = [
    { key: 'firstName', label: 'Όνομα', icon: 'person', type: 'text', placeholder: 'Όνομα' },
    { key: 'lastName', label: 'Επώνυμο', icon: 'badge', type: 'text', placeholder: 'Επώνυμο' },
    { key: 'email', label: 'Email', icon: 'mail', type: 'email', placeholder: 'example@email.com' },
    { key: 'phoneNumber', label: 'Τηλέφωνο', icon: 'phone', type: 'tel', placeholder: 'π.χ. 6912345678' },
    { key: 'address', label: 'Διεύθυνση', icon: 'location_on', type: 'text', placeholder: 'Διεύθυνση', colSpan: true },
  ]

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-surface-container rounded-lg flex items-center justify-center">
            <Icon name="person" filled className="text-primary" />
          </div>
          <h2 className={`${styles.sectionTitle} mb-0`}>Στοιχεία Χρήστη</h2>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className={styles.btnOutline}
          >
            <Icon name="edit" size="sm" />
            Επεξεργασία
          </button>
        )}
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {fields.map((field) => (
          <div key={field.key} className={`space-y-2 ${field.colSpan ? 'md:col-span-2' : ''}`}>
            <label className={`${styles.labelUpper} flex items-center gap-2`}>
              <Icon name={field.icon} size="sm" className="text-on-surface-variant" />
              {field.label}
            </label>
            {isEditing ? (
              <input
                type={field.type}
                value={formData[field.key]}
                onChange={(e) => handleInputChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className={styles.input}
              />
            ) : (
              <div className="px-4 py-3.5 bg-surface-container-highest/50 rounded-xl">
                <p className="text-sm font-medium text-on-surface">
                  {client[field.key] || '-'}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edit Action Buttons */}
      {isEditing && (
        <div className="flex gap-3 pt-6 mt-6 border-t border-outline-variant/10">
          <button
            onClick={handleSave}
            disabled={isSubmitting || !formData.firstName.trim()}
            className={`${styles.btnPrimary} ${(isSubmitting || !formData.firstName.trim()) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isSubmitting ? <Spinner size="sm" /> : <Icon name="check" size="sm" />}
            {isSubmitting ? 'Αποθήκευση...' : 'Αποθήκευση'}
          </button>
          <button
            onClick={handleCancel}
            disabled={isSubmitting}
            className={styles.btnOutline}
          >
            <Icon name="close" size="sm" />
            Ακύρωση
          </button>
        </div>
      )}
    </div>
  )
}
