'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowRightOnRectangle, HiExclamationTriangle } from 'react-icons/hi2'
import { useToast } from '@/hooks/useToast'
import { useUser } from '@/contexts/UserContext'
import { styles } from '@/styles/styles'
import { Input, Card, SegmentedControl } from '@/components'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showRegisterOption, setShowRegisterOption] = useState(false)
  const [notFoundEmail, setNotFoundEmail] = useState('')
  const [userType, setUserType] = useState('client')
  
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
      // Search for user with this email (client or garage)
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: email.trim(),
          userType: userType
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        if (data.user) {
          const user = data.user
          
          if (userType === 'garage') {
            // Garage login flow
            localStorage.setItem('garageId', user.id)
            await refreshUser(user.id)
            
            success('Επιτυχής Σύνδεση', `Καλώς ήρθατε, ${user.companyName}!`)
            
            // Redirect to garage dashboard (you can create this later)
            router.push('/garage-dashboard')
          } else {
            // Client login flow - check if there's pending vehicle data to deduplicate
            const pendingDataStr = localStorage.getItem('pendingRegistrationData')
            let pendingData = null
            
            if (pendingDataStr) {
              pendingData = JSON.parse(pendingDataStr)
              // Check if the data is not too old (within 1 hour)
              const oneHourAgo = Date.now() - (60 * 60 * 1000)
              if (pendingData.timestamp < oneHourAgo) {
                // Data is too old, ignore it
                pendingData = null
                localStorage.removeItem('pendingRegistrationData')
              }
            }

            // If there's pending vehicle data, handle deduplication
            if (pendingData) {
              try {
                const dedupeResponse = await fetch('/api/auth/register-with-vehicle', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ 
                    email: email.trim(),
                    firstName: user.firstName,
                    vehicleData: pendingData.vehicleData,
                    serviceRequestId: pendingData.serviceRequestId
                  }),
                })

                const dedupeData = await dedupeResponse.json()
                
                if (dedupeResponse.ok && dedupeData.success) {
                  // Clear pending registration data
                  localStorage.removeItem('pendingRegistrationData')
                  
                  let message = `Καλώς ήρθατε, ${user.firstName}!`
                  if (dedupeData.vehicleDeduplicated) {
                    const matchReason = dedupeData.vehicleMatchReason === 'VIN' ? 'VIN' : 'Αριθμό Κινητήρα'
                    message += ` Βρέθηκε και συνδέθηκε το υπάρχον όχημά σας (${matchReason}).`
                  }
                  
                  success('Επιτυχής Σύνδεση', message)
                  
                  // Redirect to their requests page
                  router.push(`/requests/${user.id}`)
                  return
                }
              } catch (dedupeError) {
                console.error('Vehicle deduplication error:', dedupeError)
                // Continue with normal login if deduplication fails
              }
            }
            
            // Normal client login flow
            localStorage.setItem('clientId', user.id)
            await refreshUser(user.id)
            
            success('Επιτυχής Σύνδεση', `Καλώς ήρθατε, ${user.firstName}!`)
            
            // Redirect to their requests page
            router.push(`/requests/${user.id}`)
          }
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
      if (userType === 'garage') {
        // Garage registration - redirect to professional registration page
        router.push('/register-professional')
        return
      }

      // Client registration flow
      // Check if there's pending registration data from a service request
      const pendingDataStr = localStorage.getItem('pendingRegistrationData')
      let pendingData = null
      
      if (pendingDataStr) {
        pendingData = JSON.parse(pendingDataStr)
        // Check if the data is not too old (within 1 hour)
        const oneHourAgo = Date.now() - (60 * 60 * 1000)
        if (pendingData.timestamp < oneHourAgo) {
          // Data is too old, ignore it
          pendingData = null
          localStorage.removeItem('pendingRegistrationData')
        }
      }

      let response
      
      if (pendingData) {
        // Use the new endpoint with vehicle data for deduplication
        response = await fetch('/api/auth/register-with-vehicle', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            email: notFoundEmail,
            firstName: 'Επισκέπτης', // Default name
            vehicleData: pendingData.vehicleData,
            serviceRequestId: pendingData.serviceRequestId
          }),
        })
      } else {
        // Use the regular registration endpoint
        response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            email: notFoundEmail,
            firstName: 'Επισκέπτης' // Default name
          }),
        })
      }

      const data = await response.json()

      if (response.ok && data.success) {
        // Clear pending registration data since we've processed it
        if (pendingData) {
          localStorage.removeItem('pendingRegistrationData')
        }
        
        // Registration successful - log them in
        localStorage.setItem('clientId', data.client.id)
        await refreshUser(data.client.id)
        
        let message = 'Ο λογαριασμός σας δημιουργήθηκε επιτυχώς!'
        
        if (data.isExistingUser) {
          message = 'Συνδεθήκατε επιτυχώς στον υπάρχοντα λογαριασμό σας!'
          if (data.vehicleDeduplicated) {
            const matchReason = data.vehicleMatchReason === 'VIN' ? 'VIN' : 'Αριθμό Κινητήρα'
            message += ` Βρέθηκε και συνδέθηκε το υπάρχον όχημά σας (${matchReason}).`
          }
        }
        
        success('Επιτυχής Εγγραφή', message)
        
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
              <h2 className={`${styles.pageTitle} mb-2`}>
            Σύνδεση στον Λογαριασμό σας
          </h2>
          
          <p className={styles.bodyText}>
            Εισάγετε το email σας για να συνδεθείτε
          </p>
        </div>
        <Card className={`py-8 px-4 ${styles.shadowLg} sm:rounded-lg sm:px-10`}>
          {!showRegisterOption ? (
            <form onSubmit={handleLogin} className="space-y-6">
              {/* User Type Switch */}
              <SegmentedControl
                options={[
                  { value: 'client', label: 'Πελάτης' },
                  { value: 'garage', label: 'Συνεργείο' }
                ]}
                value={userType}
                onChange={setUserType}
                variant="orange"
                className="max-w-xs mx-auto"
              />

              <div>
                <label className={`${styles.label} block mb-2`}>
                  Email
                </label>
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
                
                <h3 className={`${styles.sectionTitle} mt-4`}>
                  Δεν βρέθηκε λογαριασμός
                </h3>
                
                <p className={`${styles.bodyText} mt-2`}>
                  Δεν υπάρχει {userType === 'garage' ? 'συνεργείο' : 'λογαριασμός'} με το email{' '}
                  <span className="font-medium text-gray-900">{notFoundEmail}</span>
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleRegister}
                  className={`${styles.btnPrimary} w-full text-base py-3`}
                  disabled={isLoading}
                >
                  {isLoading ? 'Δημιουργία...' : (userType === 'garage' ? 'Εγγραφή ως Συνεργείο' : 'Δημιουργία Νέου Λογαριασμού')}
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
          <p className={styles.smallText}>
            Δεν έχετε λογαριασμό;{' '}
            <button
              onClick={() => router.push('/')}
              className={`font-medium ${styles.linkText}`}
            >
              Επιστροφή στην Αρχική
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
