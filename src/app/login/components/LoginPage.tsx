'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowRightOnRectangle, HiExclamationTriangle } from 'react-icons/hi2'
import { useToast } from '@/hooks/useToast'
import { useUser } from '@/contexts/UserContext'
import { styles } from '@/styles/styles'
import Title from '@/components/Title'
import Text from '@/components/Text'
import Input from '@/components/Input'
import Card from '@/components/Card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showRegisterOption, setShowRegisterOption] = useState(false)
  const [notFoundEmail, setNotFoundEmail] = useState('')
  
  const router = useRouter()
  const { success, error } = useToast()
  const { refreshUser } = useUser()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email.trim()) {
      error('Σφάλμα', 'Παρακαλώ εισάγετε το email σας')
      return
    }

    setIsLoading(true)
    setShowRegisterOption(false)
    setNotFoundEmail('')

    try {
      // Search for client with this email
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        if (data.client) {
          // User found - log them in
          localStorage.setItem('clientId', data.client.id)
          await refreshUser(data.client.id)
          
          success('Επιτυχής Σύνδεση', `Καλώς ήρθατε, ${data.client.firstName}!`)
          
          // Redirect to their requests page
          router.push(`/requests/${data.client.id}`)
        } else {
          // User not found - show registration option
          setNotFoundEmail(email.trim())
          setShowRegisterOption(true)
        }
      } else {
        // Rate limit or other error
        error('Σφάλμα Σύνδεσης', data.error || 'Προέκυψε σφάλμα κατά τη σύνδεση')
      }
    } catch (err) {
      console.error('Login error:', err)
      error('Σφάλμα Σύνδεσης', 'Δεν ήταν δυνατή η σύνδεση. Παρακαλώ δοκιμάστε ξανά.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!notFoundEmail) return

    setIsLoading(true)

    try {
      // Create new client with this email
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: notFoundEmail,
          firstName: 'Επισκέπτης' // Default name
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Registration successful - log them in
        localStorage.setItem('clientId', data.client.id)
        await refreshUser(data.client.id)
        
        success('Επιτυχής Εγγραφή', 'Ο λογαριασμός σας δημιουργήθηκε επιτυχώς!')
        
        // Redirect to their requests page
        router.push(`/requests/${data.client.id}`)
      } else {
        error('Σφάλμα Εγγραφής', data.error || 'Δεν ήταν δυνατή η εγγραφή')
      }
    } catch (err) {
      console.error('Registration error:', err)
      error('Σφάλμα Εγγραφής', 'Δεν ήταν δυνατή η εγγραφή. Παρακαλώ δοκιμάστε ξανά.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleTryAnotherEmail = () => {
    setShowRegisterOption(false)
    setNotFoundEmail('')
    setEmail('')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-md mx-auto px-4">
        <div className="text-center mb-8">
          <Title variant="h2" className="mb-2">
            Σύνδεση στον Λογαριασμό σας
          </Title>
          
          <Text variant="body" color="muted">
            Εισάγετε το email σας για να συνδεθείτε
          </Text>
        </div>
        <Card className={`py-8 px-4 ${styles.shadowLg} sm:rounded-lg sm:px-10`}>
          {!showRegisterOption ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <Text as="label" variant="small" weight="medium" className="block mb-2">
                  Email
                </Text>
                <Input
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="π.χ. example@email.com"
                  required
                  disabled={isLoading}
                  className="text-gray-900"
                />
              </div>

              <button
                type="submit"
                className={`${styles.btnPrimary} w-full text-base py-3`}
                disabled={isLoading || !email.trim()}
              >
                <HiArrowRightOnRectangle className="h-5 w-5" />
                {isLoading ? 'Σύνδεση...' : 'Σύνδεση'}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100">
                  <HiExclamationTriangle className="h-6 w-6 text-yellow-600" />
                </div>
                
                <Title variant="h3" className="mt-4">
                  Δεν βρέθηκε λογαριασμός
                </Title>
                
                <Text variant="body" color="muted" className="mt-2">
                  Δεν υπάρχει λογαριασμός με το email{' '}
                  <span className="font-medium text-gray-900">{notFoundEmail}</span>
                </Text>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleRegister}
                  className={`${styles.btnPrimary} w-full text-base py-3`}
                  disabled={isLoading}
                >
                  {isLoading ? 'Δημιουργία...' : 'Δημιουργία Νέου Λογαριασμού'}
                </button>
                
                <button
                  onClick={handleTryAnotherEmail}
                  className={`${styles.btnSecondary} w-full text-base py-3`}
                  disabled={isLoading}
                >
                  Δοκιμή Άλλου Email
                </button>
              </div>
            </div>
          )}
        </Card>

        <div className="mt-6 text-center">
          <Text variant="small" color="muted">
            Δεν έχετε λογαριασμό;{' '}
            <button
              onClick={() => router.push('/')}
              className={`font-medium ${styles.linkText}`}
            >
              Επιστροφή στην Αρχική
            </button>
          </Text>
        </div>
      </div>
    </div>
  )
}
