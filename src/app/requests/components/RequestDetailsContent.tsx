'use client'

import { HiCalendar, HiMapPin, HiPhone, HiClock, HiCheckCircle, HiXCircle } from 'react-icons/hi2'
import { styles } from '../../../styles/styles'

interface ServiceRequest {
  id: string
  clientId: string
  vehicleId: string
  category: string
  description: string
  status: 'appointment' | 'pending' | 'in-progress' | 'completed' | 'cancelled'
  urgency: 'low' | 'normal' | 'high'
  estimatedCost?: number
  photoUrls: string[]
  photos: any[]
  createdAt: string
  updatedAt: string
  vehicle?: {
    brand: string
    model: string
    modelYear: string
  }
}

interface RequestDetailsContentProps {
  request: ServiceRequest
  getStatusIcon: (status: string) => React.ReactNode
  getStatusText: (status: string) => string
  getStatusColor: (status: string) => string
  getUrgencyColor: (urgency: string) => string
  getUrgencyText: (urgency: string) => string
}

export default function RequestDetailsContent({ 
  request, 
  getStatusIcon, 
  getStatusText, 
  getStatusColor, 
  getUrgencyColor, 
  getUrgencyText 
}: RequestDetailsContentProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getCategoryText = (category: string) => {
    switch (category) {
      case 'service':
        return 'Συντήρηση'
      case 'fanopeia':
        return 'Φανοποιεία'
      case 'oils':
        return 'Λάδια & Υγρά'
      case 'disk':
        return 'Δισκόφρενα'
      default:
        return category
    }
  }

  return (
    <div className="space-y-6">
      {/* Status and Priority */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {getStatusIcon(request.status)}
          <span className={`px-3 py-1 text-sm font-medium rounded-full border ${getStatusColor(request.status)}`}>
            {getStatusText(request.status)}
          </span>
        </div>
        <span className={`px-3 py-1 text-sm font-medium rounded-full ${getUrgencyColor(request.urgency)}`}>
          {getUrgencyText(request.urgency)} Προτεραιότητα
        </span>
      </div>

      {/* Vehicle Information */}
      {request.vehicle && (
        <div className={styles.cardSimple}>
          <h3 className={`${styles.cardTitle} mb-3`}>Πληροφορίες Οχήματος</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">Μάρκα</p>
              <p className="font-medium text-black">{request.vehicle.brand}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Μοντέλο</p>
              <p className="font-medium text-black">{request.vehicle.model}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Έτος</p>
              <p className="font-medium text-black">{request.vehicle.modelYear}</p>
            </div>
          </div>
        </div>
      )}

      {/* Service Details */}
      <div className={styles.cardSimple}>
        <h3 className={`${styles.cardTitle} mb-3`}>Λεπτομέρειες Υπηρεσίας</h3>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600">Κατηγορία</p>
            <p className="font-medium text-black">{getCategoryText(request.category)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Περιγραφή</p>
            <p className="font-medium text-black">{request.description}</p>
          </div>
          {request.estimatedCost && (
            <div>
              <p className="text-sm text-gray-600">Εκτιμώμενο Κόστος</p>
              <p className="font-medium text-green-600">€{request.estimatedCost}</p>
            </div>
          )}
        </div>
      </div>

      {/* Photos */}
      {request.photoUrls.length > 0 && (
        <div className={styles.cardSimple}>
          <h3 className={`${styles.cardTitle} mb-3`}>
            Φωτογραφίες ({request.photoUrls.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {request.photoUrls.map((url, index) => (
              <div key={index} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={url}
                  alt={`Φωτογραφία ${index + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NzM4NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkZvdG9ncmFwaGlhPC90ZXh0Pjwvc3ZnPg=='
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className={styles.cardSimple}>
        <h3 className={`${styles.cardTitle} mb-3`}>Χρονολόγιο</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <div>
              <p className="text-sm font-medium text-black">Αίτημα δημιουργήθηκε</p>
              <p className="text-xs text-gray-500">{formatDate(request.createdAt)}</p>
            </div>
          </div>
          {request.updatedAt !== request.createdAt && (
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <div>
                <p className="text-sm font-medium text-black">Τελευταία ενημέρωση</p>
                <p className="text-xs text-gray-500">{formatDate(request.updatedAt)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status-specific information */}
      {request.status === 'appointment' && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">📅 Ραντεβού Προγραμματισμένο</h4>
          <p className="text-sm text-blue-800 mb-3">
            Έχετε προγραμματίσει ραντεβού για αυτή την υπηρεσία. Θα επικοινωνήσουμε μαζί σας σύντομα.
          </p>
          <div className="flex gap-2">
            <button className={`${styles.btnPrimary} text-sm px-4 py-2`}>
              <HiPhone className="h-4 w-4 mr-2" />
              Επικοινωνία
            </button>
            <button className={`${styles.btnSecondary} text-sm px-4 py-2`}>
              <HiMapPin className="h-4 w-4 mr-2" />
              Τοποθεσία
            </button>
          </div>
        </div>
      )}

      {request.status === 'pending' && (
        <div className="bg-yellow-50 p-4 rounded-lg">
          <h4 className="font-medium text-yellow-900 mb-2">⏳ Αναμονή Απαντήσεων</h4>
          <p className="text-sm text-yellow-800">
            Το αίτημά σας έχει σταλεί σε συνεργεία. Περιμένετε προσφορές και θα ενημερωθείτε σύντομα.
          </p>
        </div>
      )}

      {request.status === 'in-progress' && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">🔧 Εργασία σε Εξέλιξη</h4>
          <p className="text-sm text-blue-800">
            Η εργασία έχει ξεκινήσει. Θα ενημερωθείτε για την πρόοδο.
          </p>
        </div>
      )}

      {request.status === 'completed' && (
        <div className="bg-green-50 p-4 rounded-lg">
          <h4 className="font-medium text-green-900 mb-2">✅ Ολοκληρώθηκε</h4>
          <p className="text-sm text-green-800">
            Η εργασία έχει ολοκληρωθεί επιτυχώς. Ευχαριστούμε που επιλέξατε τις υπηρεσίες μας!
          </p>
        </div>
      )}

      {request.status === 'cancelled' && (
        <div className="bg-red-50 p-4 rounded-lg">
          <h4 className="font-medium text-red-900 mb-2">❌ Ακυρώθηκε</h4>
          <p className="text-sm text-red-800">
            Αυτό το αίτημα έχει ακυρωθεί. Εάν χρειάζεστε βοήθεια, μπορείτε να δημιουργήσετε νέο αίτημα.
          </p>
        </div>
      )}
    </div>
  )
}
