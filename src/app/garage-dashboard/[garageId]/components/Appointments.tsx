'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Badge } from '@/components'
import { styles } from '@/styles/styles'
import { OfferStatus } from '@/types/statuses'
import { HiCalendar, HiChatBubbleLeftRight } from 'react-icons/hi2'

interface Offer {
  id: string
  serviceRequestId: string
  price: number
  currency: string
  description: string
  status: OfferStatus
  createdAt: string
  appointmentDate?: string
  appointmentPrice?: number
  serviceRequest: {
    id: string
    description: string
    category: string
    client: {
      firstName: string
      lastName: string
      phoneNumber?: string
    }
    vehicle: {
      brand: string
      model: string
      year: number
    }
  }
}

interface AppointmentsProps {
  garageId: string
}

export default function Appointments({ garageId }: AppointmentsProps) {
  const router = useRouter()
  const [appointments, setAppointments] = useState<Offer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadAppointments()
  }, [garageId])

  const loadAppointments = async () => {
    try {
      setIsLoading(true)
      
      const response = await fetch(`/api/garage/offers?garageId=${garageId}`)
      const data = await response.json()

      if (response.ok && data.success) {
        // Filter for accepted offers with appointment dates
        // Check both enum and string format for status
        const appointmentsList = data.offers.filter((offer: any) => {
          const isAccepted = offer.status === OfferStatus.ACCEPTED || offer.status === 'accepted'
          const hasAppointmentDate = offer.appointmentDate && offer.appointmentDate.trim() !== ''
          
          if (isAccepted && hasAppointmentDate) {
            console.log('Found appointment offer:', {
              id: offer.id,
              status: offer.status,
              appointmentDate: offer.appointmentDate,
              serviceRequestId: offer.serviceRequestId
            })
          }
          
          return isAccepted && hasAppointmentDate
        })
        
        console.log('Total appointments found:', appointmentsList.length)
        
        // Sort by appointment date (earliest first)
        appointmentsList.sort((a: Offer, b: Offer) => {
          const dateA = new Date(a.appointmentDate || '').getTime()
          const dateB = new Date(b.appointmentDate || '').getTime()
          return dateA - dateB
        })
        
        setAppointments(appointmentsList)
      } else {
        console.error('Error loading appointments:', data.error)
        setAppointments([])
      }
    } catch (error) {
      console.error('Error loading appointments:', error)
      setAppointments([])
    } finally {
      setIsLoading(false)
    }
  }

  const getCategoryText = (category: string) => {
    switch (category) {
      case 'service':
        return 'Συντήρηση'
      case 'brakes':
        return 'Φρένα'
      case 'tires':
        return 'Λάστιχα'
      case 'engine':
        return 'Κινητήρας'
      case 'electrical':
        return 'Ηλεκτρικά'
      case 'oils':
        return 'Λάδια'
      default:
        return category
    }
  }

  const formatAppointmentDate = (dateString: string) => {
    const date = new Date(`${dateString}T00:00:00`)
    return date.toLocaleDateString('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      weekday: 'long'
    })
  }

  const isAppointmentTodayOrFuture = (dateString: string) => {
    try {
      // Handle different date formats
      let appointmentDate: Date
      if (dateString.includes('T')) {
        appointmentDate = new Date(dateString)
      } else {
        appointmentDate = new Date(`${dateString}T00:00:00`)
      }
      
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      appointmentDate.setHours(0, 0, 0, 0)
      
      // Check if date is valid
      if (isNaN(appointmentDate.getTime())) {
        console.error('Invalid appointment date:', dateString)
        return false
      }
      
      return appointmentDate >= today
    } catch (error) {
      console.error('Error checking appointment date:', error, dateString)
      return false
    }
  }

  const handleChatClick = (requestId: string) => {
    router.push(`/garage-dashboard/${garageId}/chat/${requestId}`)
  }

  const handleCardClick = (offer: Offer) => {
    router.push(`/garage-dashboard/${garageId}/offers/${offer.serviceRequestId}`)
  }

  // Filter to show only today and future appointments
  const upcomingAppointments = appointments.filter(offer => {
    if (!offer.appointmentDate) return false
    const isUpcoming = isAppointmentTodayOrFuture(offer.appointmentDate)
    if (!isUpcoming) {
      console.log('Filtered out past appointment:', {
        id: offer.id,
        appointmentDate: offer.appointmentDate
      })
    }
    return isUpcoming
  })
  
  console.log('Upcoming appointments count:', upcomingAppointments.length, 'out of', appointments.length)

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <p className={styles.bodyText}>Φόρτωση ραντεβού...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className={`${styles.sectionTitle} mb-2`}>
            Ραντεβού
          </h2>
          <p className={styles.bodyText}>
            Προγραμματισμένα ραντεβού με πελάτες
          </p>
        </div>
        <div className="text-sm text-gray-500">
          Σύνολο: {upcomingAppointments.length} ραντεβού
        </div>
      </div>

      {/* Appointments List */}
      {upcomingAppointments.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-gray-400 mb-4">
            <HiCalendar className="w-16 h-16 mx-auto" />
          </div>
          <h3 className={`${styles.sectionTitle} mb-2`}>
            Δεν υπάρχουν ραντεβού
          </h3>
          <p className={styles.bodyText}>
            Δεν έχετε προγραμματισμένα ραντεβού από σήμερα και μετά.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {upcomingAppointments.map((offer) => (
            <Card 
              key={offer.id} 
              className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleCardClick(offer)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className={`${styles.sectionTitle} text-lg`}>
                      {offer.serviceRequest.vehicle.brand} {offer.serviceRequest.vehicle.model} ({offer.serviceRequest.vehicle.year})
                    </h3>
                    <Badge variant="success">
                      <HiCalendar className="h-4 w-4 mr-1" />
                      Ραντεβού
                    </Badge>
                  </div>
                  
                  {/* Appointment Date - Prominent */}
                  {offer.appointmentDate && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-2">
                        <HiCalendar className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="text-sm font-medium text-blue-900">
                            Ημερομηνία Ραντεβού
                          </p>
                          <p className="text-lg font-bold text-blue-700">
                            {formatAppointmentDate(offer.appointmentDate)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className={`${styles.bodyText} mb-2`}>
                    <strong>Πελάτης:</strong> {offer.serviceRequest.client.firstName} {offer.serviceRequest.client.lastName}
                  </p>
                  {offer.serviceRequest.client.phoneNumber && (
                    <p className={`${styles.bodyText} mb-2`}>
                      <strong>Τηλέφωνο:</strong> {offer.serviceRequest.client.phoneNumber}
                    </p>
                  )}
                  <p className={`${styles.bodyText} mb-2`}>
                    <strong>Αίτημα:</strong> {offer.serviceRequest.description}
                  </p>
                  <p className={`${styles.bodyText} mb-2`}>
                    <strong>Κατηγορία:</strong> {getCategoryText(offer.serviceRequest.category)}
                  </p>
                  
                </div>
                <div className="text-right ml-4">
                  <div className={`${styles.sectionTitle} text-2xl text-orange-600`}>
                    €{typeof offer.appointmentPrice === 'number'
                      ? offer.appointmentPrice
                      : offer.price}
                  </div>
                  <div className="mt-2">
                    <p className={`${styles.smallText} text-gray-500 mb-1`}>
                      Δημιουργία
                    </p>
                    <p className={`${styles.smallText} text-gray-500`}>
                      {new Date(offer.createdAt).toLocaleDateString('el-GR')}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h4 className={`${styles.label} mb-2`}>Περιγραφή Προσφοράς:</h4>
                <p className={styles.bodyText}>
                  {offer.description}
                </p>
              </div>

              {/* Chat Button */}
              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleChatClick(offer.serviceRequestId)
                  }}
                  className={`${styles.btnPrimary} w-full flex items-center justify-center gap-2`}
                >
                  <HiChatBubbleLeftRight className="h-4 w-4" />
                  Άνοιγμα Συνομιλίας
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

