'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/contexts/AuthContext'

interface AccountDangerZoneProps {
  userId: string
  userType: 'client' | 'garage'
}

/**
 * Shared "danger zone" block for both client profiles and garage settings.
 * Implements two GDPR rights:
 *
 *   1. Right to data portability → "Κατέβασε τα δεδομένα μου"
 *   2. Right to erasure          → "Διαγραφή λογαριασμού"
 *
 * Both require the user's password as defense in depth — knowing a userId
 * isn't enough to dump/delete somebody else's account.
 */
export default function AccountDangerZone({ userId, userType }: AccountDangerZoneProps) {
  const router = useRouter()
  const { success, error } = useToast()
  const { logout } = useAuth()

  const [showExportModal, setShowExportModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [password, setPassword] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const closeExport = () => {
    if (isLoading) return
    setShowExportModal(false)
    setPassword('')
  }

  const closeDelete = () => {
    if (isLoading) return
    setShowDeleteModal(false)
    setPassword('')
    setDeleteConfirmText('')
  }

  const handleExport = async () => {
    if (!password) {
      error('Σφάλμα', 'Συμπλήρωσε τον κωδικό σου')
      return
    }
    setIsLoading(true)
    try {
      const response = await fetch('/api/account/export/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userType, password })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        error('Σφάλμα', data.error || 'Δεν ήταν δυνατή η εξαγωγή')
        return
      }

      // Stream the response as a file download.
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nextservice-data-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      success('Επιτυχία', 'Τα δεδομένα σου κατεβαίνουν')
      closeExport()
    } catch {
      error('Σφάλμα', 'Δεν ήταν δυνατή η εξαγωγή. Δοκίμασε ξανά.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!password) {
      error('Σφάλμα', 'Συμπλήρωσε τον κωδικό σου')
      return
    }
    if (deleteConfirmText.trim().toUpperCase() !== 'ΔΙΑΓΡΑΦΗ') {
      error('Σφάλμα', 'Γράψε τη λέξη ΔΙΑΓΡΑΦΗ για επιβεβαίωση')
      return
    }
    setIsLoading(true)
    try {
      const response = await fetch('/api/account/delete/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userType, password })
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.success) {
        error('Σφάλμα', data.error || 'Δεν ήταν δυνατή η διαγραφή')
        return
      }

      success('Ο λογαριασμός διαγράφηκε', 'Όλα τα δεδομένα σου έχουν διαγραφεί οριστικά')
      closeDelete()
      logout()
      router.push('/')
    } catch {
      error('Σφάλμα', 'Δεν ήταν δυνατή η διαγραφή. Δοκίμασε ξανά.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <section className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/20 mt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-surface-container rounded-lg flex items-center justify-center">
            <Icon name="shield_person" className="text-primary" />
          </div>
          <div>
            <h3 className="text-base font-bold text-on-surface">Προσωπικά δεδομένα</h3>
            <p className="text-xs text-on-surface-variant">
              Τα δικαιώματά σου σύμφωνα με τον GDPR
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => setShowExportModal(true)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg hover:bg-surface-container transition-colors"
          >
            <Icon name="download" className="text-primary" />
            <div className="flex-1">
              <p className="text-sm font-bold text-on-surface">Κατέβασε τα δεδομένα μου</p>
              <p className="text-xs text-on-surface-variant">Αρχείο JSON με όλα τα στοιχεία σου</p>
            </div>
            <Icon name="chevron_right" className="text-on-surface-variant/50" />
          </button>

          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg hover:bg-error-container/30 transition-colors"
          >
            <Icon name="delete_forever" className="text-error" />
            <div className="flex-1">
              <p className="text-sm font-bold text-error">Διαγραφή λογαριασμού</p>
              <p className="text-xs text-on-surface-variant">
                Διαγράφει οριστικά όλα τα δεδομένα σου
              </p>
            </div>
            <Icon name="chevron_right" className="text-on-surface-variant/50" />
          </button>
        </div>
      </section>

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-on-surface mb-2">Εξαγωγή δεδομένων</h3>
            <p className="text-sm text-on-surface-variant mb-4">
              Θα κατεβάσεις ένα αρχείο JSON με όλα τα δεδομένα που έχουμε για εσένα. Για την ασφάλεια σου επιβεβαίωσε τον κωδικό σου.
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ο κωδικός σου"
              disabled={isLoading}
              className="w-full bg-surface-container-high rounded-xl px-4 py-3 mb-4 focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex gap-2">
              <button
                onClick={closeExport}
                disabled={isLoading}
                className="flex-1 px-4 py-3 rounded-xl border border-outline-variant/30 font-bold text-sm text-on-surface hover:bg-surface-container"
              >
                Άκυρο
              </button>
              <button
                onClick={handleExport}
                disabled={isLoading}
                className="flex-1 px-4 py-3 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-50"
              >
                {isLoading ? 'Περίμενε...' : 'Κατέβασε'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-error-container/30 rounded-full flex items-center justify-center">
                <Icon name="warning" className="text-error" />
              </div>
              <h3 className="text-lg font-bold text-error">Διαγραφή λογαριασμού</h3>
            </div>
            <p className="text-sm text-on-surface mb-3">
              <strong>Η ενέργεια είναι μη αναστρέψιμη.</strong> Θα διαγραφούν οριστικά:
            </p>
            <ul className="text-xs text-on-surface-variant space-y-1 mb-4 pl-4 list-disc">
              <li>Ο λογαριασμός σου και τα στοιχεία επικοινωνίας</li>
              {userType === 'client' ? (
                <>
                  <li>Όλα τα οχήματά σου</li>
                  <li>Όλα τα αιτήματα service και οι φωτογραφίες</li>
                  <li>Οι συνομιλίες με συνεργεία</li>
                  <li>Οι προσφορές που έλαβες</li>
                </>
              ) : (
                <>
                  <li>Όλες οι προσφορές που έστειλες</li>
                  <li>Οι συνομιλίες με πελάτες</li>
                </>
              )}
              <li>Το ιστορικό ενεργειών και emails</li>
            </ul>

            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
              Κωδικός
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ο κωδικός σου"
              disabled={isLoading}
              className="w-full bg-surface-container-high rounded-xl px-4 py-3 mb-3 focus:ring-2 focus:ring-error/20"
            />

            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
              Γράψε τη λέξη <span className="text-error">ΔΙΑΓΡΑΦΗ</span>
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="ΔΙΑΓΡΑΦΗ"
              disabled={isLoading}
              className="w-full bg-surface-container-high rounded-xl px-4 py-3 mb-4 focus:ring-2 focus:ring-error/20 uppercase"
            />

            <div className="flex gap-2">
              <button
                onClick={closeDelete}
                disabled={isLoading}
                className="flex-1 px-4 py-3 rounded-xl border border-outline-variant/30 font-bold text-sm text-on-surface hover:bg-surface-container"
              >
                Άκυρο
              </button>
              <button
                onClick={handleDelete}
                disabled={isLoading}
                className="flex-1 px-4 py-3 rounded-xl bg-error text-on-error font-bold text-sm disabled:opacity-50"
              >
                {isLoading ? 'Διαγραφή...' : 'Διαγραφή οριστικά'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
