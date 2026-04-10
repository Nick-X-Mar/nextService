import Stripe from 'stripe'

let stripeInstance: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    stripeInstance = new Stripe(key, {
      apiVersion: '2026-03-25.dahlia',
      typescript: true,
    })
  }
  return stripeInstance
}

export const DEPOSIT_PERCENT = Number(process.env.DEPOSIT_PERCENT || '15')
export const CANCELLATION_DEADLINE_DAYS = Number(process.env.CANCELLATION_DEADLINE_DAYS || '2')
export const WALLET_CANCELLATION_REFUND_PERCENT = 50
