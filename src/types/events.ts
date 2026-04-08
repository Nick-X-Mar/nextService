/**
 * Event names tracked in the EventLogs DynamoDB table for the customer
 * journey funnel + analytics dashboard (admin app reads from same table).
 *
 * Naming convention: snake_case, past tense, no PII in the name itself.
 * Add a new entry here BEFORE you call logEvent with it so the type system
 * keeps the catalogue honest.
 */
export const EventName = {
  // Phase A — Registration & Onboarding
  ClientRegistered: 'client_registered',
  ClientLogin: 'client_login',
  GarageRegistered: 'garage_registered',
  GarageLogin: 'garage_login',
  GarageLoginPendingValidation: 'garage_login_pending_validation',
  GarageValidated: 'garage_validated',
  GuestRegisteredFromRequest: 'guest_registered_from_request',

  // Phase B — Request creation (client side)
  ServiceRequestSubmitted: 'service_request_submitted',
  DamagePhotosUploaded: 'damage_photos_uploaded',
  ClientAvailabilityDatesSubmitted: 'client_availability_dates_submitted',

  // Phase C — Discovery & engagement (garage side)
  GarageViewedAvailableRequests: 'garage_viewed_available_requests',
  ChatMessageSent: 'chat_message_sent',

  // Phase D — Offer lifecycle
  OfferCreated: 'offer_created',
  OfferUpdated: 'offer_updated',
  OfferClientAvailabilityProposed: 'offer_client_availability_proposed',
  OfferAccepted: 'offer_accepted',
  OfferRejected: 'offer_rejected',

  // Phase E — Appointment & completion
  AppointmentScheduled: 'appointment_scheduled',
  ServiceCompleted: 'service_completed',
  ServiceCancelled: 'service_cancelled',

  // Phase F — Account recovery
  PasswordResetRequested: 'password_reset_requested',
  PasswordResetCompleted: 'password_reset_completed',

  // Phase G — Account lifecycle
  AccountDeleted: 'account_deleted',
  AccountDataExported: 'account_data_exported',

  // Phase H — Sensitive data access (audit log for GDPR)
  // Fired when one user views the personal data of another. Used to
  // satisfy the GDPR right of access ("who saw my data?") and to detect
  // garages that scrape contact info without making real offers.
  GarageViewedRequestDetails: 'garage_viewed_request_details',
  GarageViewedClientContact: 'garage_viewed_client_contact',
  ClientViewedGarageProfile: 'client_viewed_garage_profile'
} as const

export type EventNameValue = typeof EventName[keyof typeof EventName]

export type ActorType = 'client' | 'garage' | 'system'

export interface LogEventInput {
  eventName: EventNameValue
  actorType: ActorType
  actorId?: string
  clientId?: string
  garageId?: string
  requestId?: string
  offerId?: string
  metadata?: Record<string, unknown>
  source?: string
}

export interface EventLogRecord extends LogEventInput {
  eventId: string
  timestamp: string
}

/**
 * Email template names. Each one maps 1:1 to a file in
 * src/lib/email-templates/. Keep this enum and the folder in sync.
 */
export const EmailTemplate = {
  WelcomeGarage: 'welcome_garage',
  GarageActivated: 'garage_activated',
  RequestConfirmation: 'request_confirmation',
  NewOfferReceived: 'new_offer_received',
  OfferAcceptedGarage: 'offer_accepted_garage',
  AppointmentConfirmationClient: 'appointment_confirmation_client',
  NewChatMessage: 'new_chat_message',
  AdminNewGarageValidation: 'admin_new_garage_validation',
  PasswordReset: 'password_reset'
} as const

export type EmailTemplateName = typeof EmailTemplate[keyof typeof EmailTemplate]

export type EmailStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'opened'
  | 'clicked'
  | 'failed'
  | 'dry_run'

export interface EmailLogRecord {
  emailId: string
  to: string
  from: string
  templateName: EmailTemplateName
  subject: string
  bodyPreview: string
  triggerEvent: EventNameValue
  status: EmailStatus
  clientId?: string
  garageId?: string
  requestId?: string
  sesMessageId?: string
  errorMessage?: string
  sentAt: string
  deliveredAt?: string
  bouncedAt?: string
}
