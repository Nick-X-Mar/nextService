'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { styles } from '@/styles/styles'
import { ServiceRequestStatus } from '@/types/statuses'
import Icon from '@/components/ui/Icon'
import type { ServiceRequest } from '@/types/requests'
import { getCategoryText } from '@/utils/categoryLabels'

interface AvailableRequestsProps {
  garageId: string
}

export default function AvailableRequests({ garageId }: AvailableRequestsProps) {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null)
  const [showOfferModal, setShowOfferModal] = useState(false)
  const router = useRouter()

  useEffect(() => {
    loadAvailableRequests()
  }, [garageId])

  const loadAvailableRequests = async () => {
    try {
      setIsLoading(true)

      const response = await fetch(`/api/garage/available-requests?garageId=${garageId}`)
      const data = await response.json()

      if (response.ok && data.success) {
        setRequests(data.requests)
      } else {
        console.error('Error loading requests:', data.error)
        setRequests([])
      }
    } catch (error) {
      console.error('Error loading requests:', error)
      setRequests([])
    } finally {
      setIsLoading(false)
    }
  }

  const getFuelTypeText = (fuelType: string | undefined) => {
    if (!fuelType) return '-'
    switch (fuelType.toLowerCase()) {
      case 'petrol':
        return 'Βενζινη'
      case 'diesel':
        return 'Πετρελαιο'
      case 'electric':
        return 'Ηλεκτρικο'
      case 'hybrid':
        return 'Υβριδικο'
      case 'lpg':
        return 'Υγραεριο'
      default:
        return fuelType
    }
  }

  // Get unique categories from requests
  const getUniqueCategories = () => {
    const categories = requests.map(request => request.category)
    return Array.from(new Set(categories))
  }

  const handleMakeOffer = (request: ServiceRequest) => {
    router.push(`/garage-dashboard/${garageId}/offers/${request.id}`)
  }

  const handleOpenChat = (request: ServiceRequest) => {
    router.push(`/garage-dashboard/${garageId}/chat/${request.id}`)
  }

  const handleCardClick = (request: ServiceRequest) => {
    router.push(`/garage-dashboard/${garageId}/offers/${request.id}`)
  }

  const filteredRequests = requests.filter(request => {
    if (filter === 'all') return true
    return request.category === filter
  })

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className={styles.loadingSpinner}></div>
        <p className="text-sm text-secondary">Φορτωση αιτηματων...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-on-surface">
          Νεα Αιτηματα
        </h2>
        <p className="text-base text-secondary leading-relaxed mt-1">
          {requests.length} αιτηματα υπηρεσιων διαθεσιμα
        </p>
      </div>

      {/* Category filter chips — horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        <button
          onClick={() => setFilter('all')}
          className={filter === 'all'
            ? 'bg-primary text-on-primary px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap'
            : 'bg-secondary-container text-on-secondary-container px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap hover:bg-surface-container-high transition-colors cursor-pointer'
          }
        >
          Ολα
        </button>
        {getUniqueCategories().map((category) => (
          <button
            key={category}
            onClick={() => setFilter(category)}
            className={filter === category
              ? 'bg-primary text-on-primary px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap'
              : 'bg-secondary-container text-on-secondary-container px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap hover:bg-surface-container-high transition-colors cursor-pointer'
            }
          >
            {getCategoryText(category)}
          </button>
        ))}
      </div>

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <article className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="inbox" size="lg" className="text-outline" />
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-on-surface mb-2">
              Δεν υπαρχουν αιτηματα
            </h3>
            <p className="text-base text-secondary leading-relaxed">
              {filter === 'all'
                ? 'Δεν υπαρχουν αιτηματα υπηρεσιων διαθεσιμα αυτη τη στιγμη.'
                : `Δεν υπαρχουν αιτηματα στην κατηγορια "${getCategoryText(filter)}".`
              }
            </p>
          </div>
        </article>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request) => (
            <article
              key={request.id}
              className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 hover:shadow-2xl hover:shadow-on-surface/5 transition-all duration-300 cursor-pointer"
              onClick={() => handleCardClick(request)}
            >
              {/* Category badge + date row */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-primary bg-primary/10 px-2 py-1 rounded-sm">
                  {getCategoryText(request.category)}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                  {new Date(request.createdAt).toLocaleDateString('el-GR')}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold font-headline text-on-surface mb-4">
                {request.vehicle?.brand} {request.vehicle?.model} &mdash; {getCategoryText(request.category)}
              </h3>

              {/* Client info bar */}
              <div className="flex items-center gap-3 p-3 bg-surface-container-low rounded-lg mb-4">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black uppercase">
                  {request.client?.firstName?.charAt(0)}{request.client?.lastName?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-on-surface truncate">
                    {request.client?.firstName} {request.client?.lastName}
                  </p>
                  <p className="text-xs text-secondary truncate">
                    {new Date(request.createdAt).toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Vehicle Spec Bento Grid */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-surface-container p-2 rounded-lg flex flex-col items-center justify-center">
                  <span className="text-[9px] font-black uppercase text-outline opacity-70">Μαρκα</span>
                  <span className="text-xs font-bold text-on-surface">{request.vehicle?.brand || '-'}</span>
                </div>
                <div className="bg-surface-container p-2 rounded-lg flex flex-col items-center justify-center">
                  <span className="text-[9px] font-black uppercase text-outline opacity-70">Μοντελο</span>
                  <span className="text-xs font-bold text-on-surface">{request.vehicle?.model || '-'}</span>
                </div>
                <div className="bg-surface-container p-2 rounded-lg flex flex-col items-center justify-center">
                  <span className="text-[9px] font-black uppercase text-outline opacity-70">Κυβικα</span>
                  <span className="text-xs font-bold text-on-surface">{request.vehicle?.engineCC ? `${request.vehicle.engineCC}` : '-'}</span>
                </div>
                <div className="bg-surface-container p-2 rounded-lg flex flex-col items-center justify-center">
                  <span className="text-[9px] font-black uppercase text-outline opacity-70">Ετος</span>
                  <span className="text-xs font-bold text-on-surface">{request.vehicle?.modelYear || '-'}</span>
                </div>
                <div className="bg-surface-container p-2 rounded-lg flex flex-col items-center justify-center">
                  <span className="text-[9px] font-black uppercase text-outline opacity-70">Καυσιμο</span>
                  <span className="text-xs font-bold text-on-surface">{getFuelTypeText(request.vehicle?.fuelType)}</span>
                </div>
                <div className="bg-surface-container p-2 rounded-lg flex flex-col items-center justify-center">
                  <span className="text-[9px] font-black uppercase text-outline opacity-70">Κιβωτιο</span>
                  <span className="text-xs font-bold text-on-surface">{request.vehicle?.isAutomatic ? 'Auto' : 'Manual'}</span>
                </div>
              </div>

              {/* Description preview */}
              {request.description && (
                <p className="text-sm text-on-surface-variant line-clamp-2 mb-4">
                  {request.description}
                </p>
              )}

              {/* Photo indicator */}
              {request.photoUrls && request.photoUrls.length > 0 && (
                <div className="flex items-center gap-1.5 text-primary mb-4">
                  <Icon name="image" filled size="sm" />
                  <span className="text-xs font-bold">{request.photoUrls.length} Φωτογραφιες</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMakeOffer(request)
                  }}
                  className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-3 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 shadow-lg shadow-primary/20 flex items-center gap-2 flex-1 justify-center"
                >
                  <Icon name="send" size="sm" />
                  Κανε Προσφορα
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOpenChat(request)
                  }}
                  className="bg-surface-variant text-on-surface-variant hover:bg-surface-container-high px-4 py-3 rounded-lg text-sm font-bold transition-colors duration-200 flex items-center gap-2"
                >
                  <Icon name="chat" size="sm" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Offer Modal - TODO: Implement this */}
      {showOfferModal && selectedRequest && (
        <div className="fixed inset-0 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 max-w-md w-full">
            <h3 className="text-2xl font-bold tracking-tight text-on-surface mb-4">
              Κανε Προσφορα
            </h3>
            <p className="text-base text-secondary leading-relaxed">
              Προσφορα για: {selectedRequest.vehicle?.brand} {selectedRequest.vehicle?.model}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  // TODO: Implement offer submission
                  setShowOfferModal(false)
                  setSelectedRequest(null)
                }}
                className={styles.btnPrimary}
              >
                Υποβολη Προσφορας
              </button>
              <button
                onClick={() => {
                  setShowOfferModal(false)
                  setSelectedRequest(null)
                }}
                className={styles.btnSecondary}
              >
                Ακυρωση
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
