'use client'

import { useState } from 'react'
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js'
import Modal from '@/components/Modal'
import StripeProvider from '@/components/StripeProvider'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import type { SavedCard } from '@/types/payments'

interface PaymentModalProps {
  isOpen: boolean
  onClose: () => void
  offerAmount: number
  depositAmount: number
  remainingAmount: number
  clientSecret: string | null
  savedCards: SavedCard[]
  isLoading: boolean
  error: string | null
  onPaymentSuccess: (paymentIntentId: string) => void
  onPaymentError: (error: string) => void
}

export default function PaymentModal({
  isOpen,
  onClose,
  offerAmount,
  depositAmount,
  remainingAmount,
  clientSecret,
  savedCards,
  isLoading,
  error,
  onPaymentSuccess,
  onPaymentError
}: PaymentModalProps) {
  const [step, setStep] = useState<'breakdown' | 'payment'>('breakdown')

  const handleClose = () => {
    setStep('breakdown')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === 'breakdown' ? 'Σύνοψη Κράτησης' : 'Πληρωμή'}
      size="md"
    >
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-on-surface-variant">Προετοιμασία πληρωμής...</p>
        </div>
      )}

      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center">
            <Icon name="error" className="text-error" />
          </div>
          <p className="text-sm text-error text-center">{error}</p>
          <button
            onClick={handleClose}
            className="mt-2 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/8 rounded-lg transition-colors"
          >
            Κλείσιμο
          </button>
        </div>
      )}

      {!isLoading && !error && step === 'breakdown' && (
        <BreakdownStep
          offerAmount={offerAmount}
          depositAmount={depositAmount}
          remainingAmount={remainingAmount}
          onContinue={() => setStep('payment')}
          onCancel={handleClose}
        />
      )}

      {!isLoading && !error && step === 'payment' && clientSecret && (
        <StripeProvider clientSecret={clientSecret}>
          <PaymentStep
            depositAmount={depositAmount}
            savedCards={savedCards}
            onBack={() => setStep('breakdown')}
            onSuccess={onPaymentSuccess}
            onError={onPaymentError}
          />
        </StripeProvider>
      )}
    </Modal>
  )
}

function BreakdownStep({
  offerAmount,
  depositAmount,
  remainingAmount,
  onContinue,
  onCancel
}: {
  offerAmount: number
  depositAmount: number
  remainingAmount: number
  onContinue: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-5">
      {/* Price breakdown */}
      <div className="bg-surface-container rounded-xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-on-surface-variant">Ποσό προσφοράς</span>
          <span className="text-sm font-medium text-on-surface">{offerAmount.toFixed(2)}€</span>
        </div>
        <div className="border-t border-outline-variant/20" />
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-primary">Προκαταβολή (15%)</span>
          <span className="text-base font-bold text-primary">{depositAmount.toFixed(2)}€</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-on-surface-variant">Υπόλοιπο στο συνεργείο</span>
          <span className="text-sm font-medium text-on-surface">{remainingAmount.toFixed(2)}€</span>
        </div>
      </div>

      {/* Info text */}
      <div className="flex gap-3 p-3 bg-tertiary-container/30 rounded-xl">
        <Icon name="info" size="sm" className="text-tertiary mt-0.5 shrink-0" />
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Η προκαταβολή εξασφαλίζει τη κράτηση του ραντεβού σας.
          Το υπόλοιπο καταβάλλεται απευθείας στο συνεργείο μετά την ολοκλήρωση της εργασίας.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-3 text-sm font-bold text-on-surface-variant bg-surface-container hover:bg-surface-container-high rounded-xl transition-colors"
        >
          Ακύρωση
        </button>
        <button
          onClick={onContinue}
          className="flex-1 px-4 py-3 text-sm font-bold text-on-primary bg-primary hover:bg-primary/90 rounded-xl transition-colors"
        >
          Συνέχεια στην πληρωμή
        </button>
      </div>
    </div>
  )
}

function PaymentStep({
  depositAmount,
  savedCards,
  onBack,
  onSuccess,
  onError
}: {
  depositAmount: number
  savedCards: SavedCard[]
  onBack: () => void
  onSuccess: (paymentIntentId: string) => void
  onError: (error: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!stripe) return

    setIsProcessing(true)
    setPaymentError(null)

    try {
      let result

      if (selectedCard) {
        // Pay with saved card — clientSecret is handled by the Elements provider
        result = await stripe.confirmPayment({
          elements: elements!,
          confirmParams: {
            payment_method: selectedCard,
            return_url: window.location.href,
          },
          redirect: 'if_required',
        })
      } else {
        // Pay with new card via Elements
        if (!elements) return

        result = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: window.location.href,
          },
          redirect: 'if_required',
        })
      }

      if (result.error) {
        const msg = result.error.message || 'Η πληρωμή απέτυχε. Δοκιμάστε ξανά.'
        setPaymentError(msg)
        onError(msg)
      } else if (result.paymentIntent?.status === 'succeeded') {
        onSuccess(result.paymentIntent.id)
      } else {
        setPaymentError('Η πληρωμή δεν ολοκληρώθηκε. Δοκιμάστε ξανά.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Σφάλμα πληρωμής'
      setPaymentError(msg)
      onError(msg)
    } finally {
      setIsProcessing(false)
    }
  }

  const brandIcons: Record<string, string> = {
    visa: 'credit_card',
    mastercard: 'credit_card',
    amex: 'credit_card',
  }

  return (
    <div className="space-y-5">
      {/* Saved cards */}
      {savedCards.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-on-surface">Αποθηκευμένες κάρτες</p>
          {savedCards.map((card) => (
            <label
              key={card.paymentMethodId}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                selectedCard === card.paymentMethodId
                  ? 'border-primary bg-primary/5'
                  : 'border-outline-variant/20 hover:border-outline-variant/40'
              }`}
            >
              <input
                type="radio"
                name="payment-method"
                value={card.paymentMethodId}
                checked={selectedCard === card.paymentMethodId}
                onChange={() => setSelectedCard(card.paymentMethodId)}
                className="accent-primary"
              />
              <Icon name={brandIcons[card.brand] || 'credit_card'} size="sm" className="text-on-surface-variant" />
              <span className="text-sm text-on-surface">
                {card.brand.charAt(0).toUpperCase() + card.brand.slice(1)} **** {card.last4}
              </span>
              <span className="text-xs text-on-surface-variant ml-auto">
                {String(card.expMonth).padStart(2, '0')}/{card.expYear}
              </span>
            </label>
          ))}
          <label
            className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
              selectedCard === null
                ? 'border-primary bg-primary/5'
                : 'border-outline-variant/20 hover:border-outline-variant/40'
            }`}
          >
            <input
              type="radio"
              name="payment-method"
              checked={selectedCard === null}
              onChange={() => setSelectedCard(null)}
              className="accent-primary"
            />
            <Icon name="add_card" size="sm" className="text-on-surface-variant" />
            <span className="text-sm text-on-surface">Νέα κάρτα</span>
          </label>
        </div>
      )}

      {/* Stripe Payment Element (for new cards) */}
      {selectedCard === null && (
        <div className="rounded-xl border border-outline-variant/20 p-4">
          <PaymentElement
            options={{
              layout: 'tabs',
            }}
          />
        </div>
      )}

      {/* Error */}
      {paymentError && (
        <div className="flex gap-2 p-3 bg-error-container/30 rounded-xl">
          <Icon name="error" size="sm" className="text-error shrink-0" />
          <p className="text-xs text-error">{paymentError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          disabled={isProcessing}
          className="px-4 py-3 text-sm font-bold text-on-surface-variant bg-surface-container hover:bg-surface-container-high rounded-xl transition-colors disabled:opacity-50"
        >
          Πίσω
        </button>
        <button
          onClick={handleSubmit}
          disabled={isProcessing || !stripe}
          className="flex-1 px-4 py-3 text-sm font-bold text-on-primary bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <Spinner size="sm" />
              Επεξεργασία...
            </>
          ) : (
            <>
              <Icon name="lock" size="sm" />
              Πληρωμή {depositAmount.toFixed(2)}€
            </>
          )}
        </button>
      </div>
    </div>
  )
}
