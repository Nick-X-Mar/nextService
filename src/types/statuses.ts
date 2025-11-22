/**
 * Service Request Status Enum
 * 
 * Represents the possible states of a service request throughout its lifecycle.
 */
export enum ServiceRequestStatus {
  /** Initial state - Request created, awaiting garage offers */
  PENDING = 'pending',
  
  /** Service work has begun */
  IN_PROGRESS = 'in-progress',
  
  /** Client accepted an offer, appointment scheduled */
  APPOINTMENT = 'appointment',
  
  /** Service work completed */
  COMPLETED = 'completed',
  
  /** Request cancelled by client or system */
  CANCELLED = 'cancelled'
}

/**
 * Offer Status Enum
 * 
 * Represents the possible states of an offer made by a garage.
 */
export enum OfferStatus {
  /** Draft offer - not yet submitted */
  DRAFT = 'draft',
  
  /** Offer submitted, awaiting client response */
  PENDING = 'pending',
  
  /** Client accepted this offer */
  ACCEPTED = 'accepted',
  
  /** Client rejected this offer or another offer was accepted */
  REJECTED = 'rejected',
  
  /** Offer expired (if expiration logic is implemented) */
  EXPIRED = 'expired'
}

