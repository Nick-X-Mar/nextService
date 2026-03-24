'use client'

import { useState, useEffect } from 'react'
import { HiUser, HiPencil, HiCheck, HiXMark, HiEnvelope, HiPhone, HiMapPin } from 'react-icons/hi2'
import Card from '../../../../components/Card'
import Button from '../../../../components/Button'
import Input from '../../../../components/Input'
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

  return (
    <Card variant="default" padding="lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <HiUser className="h-5 w-5 text-orange-600" />
          </div>
          <h2 className={`${styles.sectionTitle} mb-0`}>Στοιχεία Χρήστη</h2>
        </div>
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            <HiPencil className="h-4 w-4" />
            Επεξεργασία
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* First Name */}
        <div className="space-y-2">
          <label className={`${styles.label} flex items-center gap-2`}>
            <HiUser className="h-4 w-4 text-gray-500" />
            Όνομα
          </label>
          {isEditing ? (
            <Input
              type="text"
              value={formData.firstName}
              onChange={(value) => handleInputChange('firstName', value)}
              placeholder="Όνομα"
              required
            />
          ) : (
            <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                {client.firstName || '-'}
              </p>
            </div>
          )}
        </div>

        {/* Last Name */}
        <div className="space-y-2">
          <label className={styles.label}>Επώνυμο</label>
          {isEditing ? (
            <Input
              type="text"
              value={formData.lastName}
              onChange={(value) => handleInputChange('lastName', value)}
              placeholder="Επώνυμο"
            />
          ) : (
            <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                {client.lastName || '-'}
              </p>
            </div>
          )}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label className={`${styles.label} flex items-center gap-2`}>
            <HiEnvelope className="h-4 w-4 text-gray-500" />
            Email
          </label>
          {isEditing ? (
            <Input
              type="email"
              value={formData.email}
              onChange={(value) => handleInputChange('email', value)}
              placeholder="example@email.com"
            />
          ) : (
            <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                {client.email || '-'}
              </p>
            </div>
          )}
        </div>

        {/* Phone Number */}
        <div className="space-y-2">
          <label className={`${styles.label} flex items-center gap-2`}>
            <HiPhone className="h-4 w-4 text-gray-500" />
            Τηλέφωνο
          </label>
          {isEditing ? (
            <Input
              type="tel"
              value={formData.phoneNumber}
              onChange={(value) => handleInputChange('phoneNumber', value)}
              placeholder="π.χ. 6912345678"
            />
          ) : (
            <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                {client.phoneNumber || '-'}
              </p>
            </div>
          )}
        </div>

        {/* Address - Full width */}
        <div className="space-y-2 md:col-span-2">
          <label className={`${styles.label} flex items-center gap-2`}>
            <HiMapPin className="h-4 w-4 text-gray-500" />
            Διεύθυνση
          </label>
          {isEditing ? (
            <Input
              type="text"
              value={formData.address}
              onChange={(value) => handleInputChange('address', value)}
              placeholder="Διεύθυνση"
            />
          ) : (
            <div className="px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <p className={`${styles.bodyText} text-gray-900 font-medium`}>
                {client.address || '-'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Action Buttons */}
      {isEditing && (
        <div className="flex gap-3 pt-6 mt-6 border-t border-gray-200">
          <Button
            variant="primary"
            onClick={handleSave}
            loading={isSubmitting}
            disabled={!formData.firstName.trim()}
          >
            <HiCheck className="h-4 w-4" />
            Αποθήκευση
          </Button>
          <Button
            variant="secondary"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            <HiXMark className="h-4 w-4" />
            Ακύρωση
          </Button>
        </div>
      )}
    </Card>
  )
}
