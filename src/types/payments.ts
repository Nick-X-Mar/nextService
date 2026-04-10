/** Stored in the Payments DynamoDB table */
export interface PaymentRecord {
  paymentId: string           // PK — Stripe PaymentIntent ID (pi_xxx)
  clientId: string
  garageId: string
  requestId: string
  offerId: string
  stripeCustomerId: string
  amount: number              // deposit amount in cents
  depositPercent: number      // e.g. 15
  totalOfferAmount: number    // full offer price in cents
  currency: string            // 'eur'
  status: PaymentStatus
  createdAt: string
  updatedAt: string
}

export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

/** Stored in the WalletTransactions DynamoDB table */
export interface WalletTransaction {
  transactionId: string       // PK — UUID
  clientId: string            // GSI partition key
  type: 'credit' | 'debit'
  points: number              // always positive; sign determined by type
  reason: WalletTransactionReason
  requestId?: string
  paymentId?: string
  description?: string
  createdAt: string           // GSI sort key
}

export type WalletTransactionReason =
  | 'cancellation_refund'
  | 'manual_credit'
  | 'payment_applied'

/** API response shapes */
export interface CreatePaymentIntentResponse {
  clientSecret: string
  paymentIntentId: string
  stripeCustomerId: string
  depositAmount: number       // euros (display)
  depositAmountCents: number  // cents (internal)
  remainingAmount: number     // euros
  savedCards: SavedCard[]
}

export interface SavedCard {
  paymentMethodId: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

export interface WalletBalanceResponse {
  points: number
}

export interface WalletTransactionsResponse {
  transactions: WalletTransaction[]
}
