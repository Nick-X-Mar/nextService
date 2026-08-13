'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { styles } from '@/styles/styles'
import Icon from '@/components/ui/Icon'
import { LoadMoreButton } from '@/components'
import type { ServiceRequest } from '@/types/requests'
import { ServiceRequestStatus } from '@/types/statuses'
import { getCategoryText } from '@/utils/categoryLabels'
import { useRealtimeRequests, type BroadcastRequest } from '@/hooks/useRealtimeRequests'

interface AvailableRequestsProps {
  garageId: string
}

// Realtime payloads omit some fields that the local ServiceRequest interface
// has as optional — convert to the wider type before merging into state.
function toServiceRequest(broadcast: BroadcastRequest): ServiceRequest {
  return {
    id: broadcast.id,
    clientId: '',
    vehicleId: '',
    category: broadcast.category,
    description: broadcast.description ?? '',
    status: broadcast.status as ServiceRequestStatus,
    photoUrls: broadcast.photoUrls ?? [],
    photos: [],
    createdAt: broadcast.createdAt,
    updatedAt: broadcast.createdAt,
    clientAvailabilityDates: broadcast.clientAvailabilityDates,
    client: broadcast.client ? {
      firstName: broadcast.client.firstName ?? '',
      lastName: broadcast.client.lastName,
      phoneNumber: broadcast.client.phoneNumber,
    } : undefined,
    vehicle: broadcast.vehicle ? {
      brand: broadcast.vehicle.brand ?? '',
      model: broadcast.vehicle.model ?? '',
      modelYear: broadcast.vehicle.modelYear,
      engineCC: broadcast.vehicle.engineCC,
      fuelType: broadcast.vehicle.fuelType,
      isAutomatic: broadcast.vehicle.isAutomatic,
      is4x4: broadcast.vehicle.is4x4,
      isTurbo: broadcast.vehicle.isTurbo,
      licensePlate: broadcast.vehicle.licensePlate,
    } : undefined,
  }
}

const HIGHLIGHT_DURATION_MS = 10_000

export default function AvailableRequests({ garageId }: AvailableRequestsProps) {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  // Cursor into the pending-request feed; null once it is exhausted.
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null)
  const [showOfferModal, setShowOfferModal] = useState(false)
  // Ids that arrived via realtime in the last few seconds — used purely for a
  // visual highlight on the corresponding card.
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())
  const router = useRouter()

  // Hold a ref to the offer-request ids the garage has already responded to so
  // we can filter realtime arrivals that are no longer relevant. The initial
  // fetch from /api/garage/available-requests already does this filter
  // server-side; we only need it for cards added later.
  const respondedRequestIdsRef = useRef<Set<string>>(new Set())

  /**
   * Appends the next page of the pending-request feed.
   *
   * A page can come back with few or no rows even when more exist, because the
   * server drops requests this garage has already bid on *after* reading the
   * page. The cursor still advances, so pressing again keeps moving forward.
   */
  const loadMoreRequests = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const response = await fetch(
        `/api/garage/available-requests/?garageId=${garageId}&cursor=${encodeURIComponent(nextCursor)}`
      )
      const data = await response.json()
      if (response.ok && data.success) {
        setNextCursor(data.nextCursor ?? null)
        setRequests((prev) => {
          const seen = new Set(prev.map((r) => r.id))
          return [...prev, ...(data.requests || []).filter((r: ServiceRequest) => !seen.has(r.id))]
        })
      }
    } catch (error) {
      console.error('Error loading more requests:', error)
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore, garageId])

  const loadAvailableRequests = useCallback(async () => {
    try {
      setIsLoading(true)

      const response = await fetch(`/api/garage/available-requests/?garageId=${garageId}`)
      const data = await response.json()

      if (response.ok && data.success) {
        setNextCursor(data.nextCursor ?? null)
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
  }, [garageId])

  useEffect(() => {
    loadAvailableRequests()
  }, [loadAvailableRequests])

  const handleNewRequest = useCallback((broadcast: BroadcastRequest) => {
    // Skip if we already have it (e.g. arrived via initial fetch racing the
    // broadcast) or if this garage already responded.
    if (respondedRequestIdsRef.current.has(broadcast.id)) return

    setRequests(prev => {
      if (prev.some(r => r.id === broadcast.id)) return prev
      return [toServiceRequest(broadcast), ...prev]
    })

    setHighlightedIds(prev => {
      const next = new Set(prev)
      next.add(broadcast.id)
      return next
    })
    setTimeout(() => {
      setHighlightedIds(prev => {
        if (!prev.has(broadcast.id)) return prev
        const next = new Set(prev)
        next.delete(broadcast.id)
        return next
      })
    }, HIGHLIGHT_DURATION_MS)
  }, [])

  const handleRequestUpdate = useCallback((update: { requestId: string; status: string }) => {
    // Anything that's no longer pending should disappear from the list — e.g.
    // the client cancelled or another garage's offer was accepted.
    if (update.status && update.status !== ServiceRequestStatus.PENDING) {
      setRequests(prev => prev.filter(r => r.id !== update.requestId))
      setHighlightedIds(prev => {
        if (!prev.has(update.requestId)) return prev
        const next = new Set(prev)
        next.delete(update.requestId)
        return next
      })
    }
  }, [])

  useRealtimeRequests({
    onNewRequest: handleNewRequest,
    onRequestUpdate: handleRequestUpdate,
    // After a reconnect we may have missed events — refetch to catch up.
    onReconnect: loadAvailableRequests,
  })

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
    respondedRequestIdsRef.current.add(request.id)
    router.push(`/garage-dashboard/${garageId}/offers/${request.id}/`)
  }

  const handleOpenChat = (request: ServiceRequest) => {
    router.push(`/garage-dashboard/${garageId}/chat/${request.id}/`)
  }

  const handleCardClick = (request: ServiceRequest) => {
    respondedRequestIdsRef.current.add(request.id)
    router.push(`/garage-dashboard/${garageId}/offers/${request.id}/`)
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
          {filteredRequests.map((request) => {
            const isNew = highlightedIds.has(request.id)
            return (
              <article
                key={request.id}
                className={
                  'bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border hover:shadow-2xl hover:shadow-on-surface/5 transition-all duration-300 cursor-pointer ' +
                  (isNew
                    ? 'border-primary/40 ring-2 ring-primary/30'
                    : 'border-outline-variant/10')
                }
                onClick={() => handleCardClick(request)}
              >
                {/* Category badge + date row */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-primary bg-primary/10 px-2 py-1 rounded-sm">
                      {getCategoryText(request.category)}
                    </span>
                    {isNew && (
                      <span className="text-[0.6rem] font-black uppercase tracking-[0.1em] text-on-primary bg-primary px-2 py-1 rounded-sm">
                        Νεο
                      </span>
                    )}
                  </div>
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

                {/* Photos */}
                {request.photoUrls && request.photoUrls.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-1.5 text-primary mb-2">
                      <Icon name="photo_library" filled size="sm" />
                      <span className="text-xs font-bold">{request.photoUrls.length} Φωτογραφίες</span>
                    </div>
                    <div className="flex gap-2">
                      {request.photoUrls.slice(0, 3).map((url: string, i: number) => (
                        <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden bg-surface-container flex-shrink-0">
                          <Image src={url} alt={`Φωτο ${i + 1}`} fill sizes="64px" className="object-cover" />
                        </div>
                      ))}
                      {request.photoUrls.length > 3 && (
                        <div className="w-16 h-16 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-secondary">+{request.photoUrls.length - 3}</span>
                        </div>
                      )}
                    </div>
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
            )
          })}
          <LoadMoreButton
            hasMore={!!nextCursor}
            loading={loadingMore}
            onClick={loadMoreRequests}
            label="Περισσότερα αιτήματα"
          />
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
