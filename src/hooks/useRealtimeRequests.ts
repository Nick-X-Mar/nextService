'use client'

import { useEffect, useRef, useState } from 'react'
import appSyncService from '@/lib/appsync-service'

// Channel constants (mirrored from src/utils/requestBroadcast.ts to keep the
// client bundle free of server-side imports).
const NEW_REQUESTS_CHANNEL = 'new-requests'
const REQUEST_UPDATES_CHANNEL = 'request-updates'

// Payload shapes match the server-side broadcast helper. Re-declared here
// because the helper imports server-only modules.
export interface BroadcastRequest {
  id: string
  description?: string
  category: string
  status: string
  createdAt: string
  clientAvailabilityDates?: string[]
  photoUrls: string[]
  client: {
    firstName?: string
    lastName?: string
    phoneNumber?: string
  } | null
  vehicle: {
    brand?: string
    model?: string
    year?: string
    licensePlate?: string
    modelYear?: string
    engineCC?: string
    fuelType?: string
    isAutomatic?: boolean
    is4x4?: boolean
    isTurbo?: boolean
  } | null
}

export interface RequestUpdatePayload {
  requestId: string
  status: string
  reason?: string
}

interface UseRealtimeRequestsOptions {
  onNewRequest?: (request: BroadcastRequest) => void
  onRequestUpdate?: (update: RequestUpdatePayload) => void
  // Fires when the connection drops and is restored — callers should refetch
  // their list to fill any gap of events that occurred while disconnected.
  onReconnect?: () => void
  enabled?: boolean
}

// Subscribes a garage dashboard to broadcasts about new service requests
// and request lifecycle updates. The connection is shared with chat via the
// AppSync singleton, so we only manage subscriptions, never the socket.
export function useRealtimeRequests({
  onNewRequest,
  onRequestUpdate,
  onReconnect,
  enabled = true,
}: UseRealtimeRequestsOptions) {
  const [isConnected, setIsConnected] = useState(false)

  // Keep refs to the latest callbacks so that subscribing once is enough; we
  // avoid re-subscribing on every render even if the consumer passes inline
  // closures.
  const onNewRequestRef = useRef(onNewRequest)
  const onRequestUpdateRef = useRef(onRequestUpdate)
  const onReconnectRef = useRef(onReconnect)

  useEffect(() => { onNewRequestRef.current = onNewRequest }, [onNewRequest])
  useEffect(() => { onRequestUpdateRef.current = onRequestUpdate }, [onRequestUpdate])
  useEffect(() => { onReconnectRef.current = onReconnect }, [onReconnect])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let disposeNew: (() => void) | undefined
    let disposeUpdate: (() => void) | undefined

    const setup = async () => {
      try {
        if (!appSyncService.getConnectionStatus()) {
          await appSyncService.connect()
        }
        if (cancelled) return
        setIsConnected(true)

        disposeNew = appSyncService.subscribe(NEW_REQUESTS_CHANNEL, (payload) => {
          // Defensive: ignore subscription confirmations & cross-channel events
          if (!payload || payload.__type !== 'new-request' || !payload.request) return
          onNewRequestRef.current?.(payload.request as BroadcastRequest)
        })

        disposeUpdate = appSyncService.subscribe(REQUEST_UPDATES_CHANNEL, (payload) => {
          if (!payload || payload.__type !== 'request-update' || !payload.requestId) return
          onRequestUpdateRef.current?.({
            requestId: payload.requestId,
            status: payload.status,
            reason: payload.reason,
          })
        })
      } catch (error) {
        console.error('[useRealtimeRequests] Failed to set up subscriptions:', error)
        setIsConnected(false)
      }
    }

    setup()

    const removeReconnect = appSyncService.onReconnect(() => {
      setIsConnected(true)
      onReconnectRef.current?.()
    })

    return () => {
      cancelled = true
      removeReconnect()
      disposeNew?.()
      disposeUpdate?.()
    }
  }, [enabled])

  return { isConnected }
}
