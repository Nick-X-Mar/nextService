/** Which screen a garage's dashboard shows — see GET /api/garage/booked-jobs. */
export type GarageAccountState = 'active' | 'pending' | 'deactivated'

/** A job a garage has booked and not yet closed, as an inactive garage may see it. */
export interface BookedJob {
  requestId: string
  category: string
  appointmentDate: string
  appointmentTime: string | null
  /** The agreed price — the quote the completion form starts from. */
  price: number | null
  vehicle: { brand?: string; model?: string; modelYear?: string } | null
  /** First name at most, or absent when the account has no real one. */
  clientFirstName?: string
}
