'use client'

import { Elements } from '@stripe/react-stripe-js'
import { getStripePromise } from '@/lib/stripe-client'

interface StripeProviderProps {
  clientSecret: string
  children: React.ReactNode
}

export default function StripeProvider({ clientSecret, children }: StripeProviderProps) {
  return (
    <Elements
      stripe={getStripePromise()}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#6750a4',
            borderRadius: '12px',
            fontFamily: 'inherit',
          },
        },
        locale: 'el',
      }}
    >
      {children}
    </Elements>
  )
}
