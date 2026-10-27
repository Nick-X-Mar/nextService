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
  estimatedCost?: number | null
  // The open-market (quoting) view of `src/utils/garageClientView.ts`: every
  // active garage receives this, so it never carries surname, phone or plate.
  client: {
    firstName?: string
  } | null
  vehicle: {
    brand?: string
    model?: string
    year?: string
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

// Photos land after the request itself, so they arrive as their own event on
// the updates channel rather than as part of the new-request payload.
export interface RequestPhotosPayload {
  requestId: string
  photoUrls: string[]
}

interface UseRealtimeRequestsOptions {
  onNewRequest?: (request: BroadcastRequest) => void
  onRequestUpdate?: (update: RequestUpdatePayload) => void
  onRequestPhotos?: (payload: RequestPhotosPayload) => void
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
  onRequestPhotos,
  onReconnect,
  enabled = true,
}: UseRealtimeRequestsOptions) {
  const [isConnected, setIsConnected] = useState(false)

  // Keep refs to the latest callbacks so that subscribing once is enough; we
  // avoid re-subscribing on every render even if the consumer passes inline
  // closures.
  const onNewRequestRef = useRef(onNewRequest)
  const onRequestUpdateRef = useRef(onRequestUpdate)
  const onRequestPhotosRef = useRef(onRequestPhotos)
  const onReconnectRef = useRef(onReconnect)

  useEffect(() => { onNewRequestRef.current = onNewRequest }, [onNewRequest])
  useEffect(() => { onRequestUpdateRef.current = onRequestUpdate }, [onRequestUpdate])
  useEffect(() => { onRequestPhotosRef.current = onRequestPhotos }, [onRequestPhotos])
  useEffect(() => { onReconnectRef.current = onReconnect }, [onReconnect])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    // Registered straight away rather than after connect() resolves: subscribe()
    // opens the socket itself and every open replays the registered channels.
    // Awaiting connect() first meant one failed handshake or token fetch (a 429,
    // a timeout) skipped both subscriptions, and with nothing registered the
    // wake listeners had nothing to retry — the feed stayed dead until reload.
    const disposeNew = appSyncService.subscribe(NEW_REQUESTS_CHANNEL, (payload) => {
      // Defensive: ignore subscription confirmations & cross-channel events
      if (!payload || payload.__type !== 'new-request' || !payload.request) return
      onNewRequestRef.current?.(payload.request as BroadcastRequest)
    })

    const disposeUpdate = appSyncService.subscribe(REQUEST_UPDATES_CHANNEL, (payload) => {
      if (!payload || !payload.requestId) return
      if (payload.__type === 'request-photos') {
        onRequestPhotosRef.current?.({
          requestId: payload.requestId,
          photoUrls: Array.isArray(payload.photoUrls) ? payload.photoUrls : [],
        })
        return
      }
      if (payload.__type !== 'request-update') return
      onRequestUpdateRef.current?.({
        requestId: payload.requestId,
        status: payload.status,
        reason: payload.reason,
      })
    })

    if (appSyncService.getConnectionStatus()) {
      setIsConnected(true)
    } else {
      appSyncService.connect()
        .then(() => { if (!cancelled) setIsConnected(true) })
        .catch((error) => {
          console.error('[useRealtimeRequests] Connect failed; will retry on reconnect/wake:', error)
          if (!cancelled) setIsConnected(false)
        })
    }

    const removeReconnect = appSyncService.onReconnect(() => {
      setIsConnected(true)
      onReconnectRef.current?.()
    })

    return () => {
      cancelled = true
      removeReconnect()
      disposeNew()
      disposeUpdate()
    }
  }, [enabled])

  return { isConnected }
}
