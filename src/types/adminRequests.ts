/** One row of the admin's request list (/admin/requests). */
export interface AdminRequestRow {
  id: string
  createdAt: string
  status: string
  category: string
  client: { id: string; name: string; phone: string; email: string } | null
  vehicle: { label: string; plate: string } | null
  offerCount: number
  /** Chat messages across every garage's thread. */
  messageCount: number
  /** Garages that said they cannot take it. */
  declineCount: number
  /** The garage that won, once an offer has been accepted. */
  garageName: string | null
  appointmentDate: string | null
  appointmentTime: string | null
}

export interface AdminRequestList {
  items: AdminRequestRow[]
  /** Rows matching every filter, across all pages. */
  total: number
  page: number
  pageSize: number
  /** Per status, under every filter except the status itself. */
  byStatus: Record<string, number>
  funnel: { created: number; offered: number; accepted: number; completed: number }
  /** Still pending with no offer at all: the requests that need someone to act. */
  pendingNoOffers: number
  /** The categories in the date range, for the filter's options. */
  categories: { value: string; count: number }[]
  /** Who the `clientId` filter is on, when it is set. */
  client: { id: string; name: string } | null
}
