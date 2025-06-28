'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowRight, HiCloudArrowUp, HiPhoto, HiXMark } from 'react-icons/hi2'
import { styles } from '../../styles/styles'
import { saveFormData } from '../../utils/formStorage'

interface BodyWorkPhotosFormProps {
  savedData: {
    category: string
    description: string
    brand: string
    model: string
  }
}

export default function BodyWorkPhotosForm({ savedData }: BodyWorkPhotosFormProps) {
  const router = useRouter()
  const [photos, setPhotos] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    addPhotos(files)
  }

  const addPhotos = (newFiles: File[]) => {
    // Filter only image files and limit to 3 total
    const imageFiles = newFiles.filter(file => file.type.startsWith('image/'))
    const availableSlots = 3 - photos.length
    const filesToAdd = imageFiles.slice(0, availableSlots)
    
    setPhotos(prev => [...prev, ...filesToAdd])
  }

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    const files = Array.from(e.dataTransfer.files)
    addPhotos(files)
  }

  const isFormValid = photos.length >= 1

  const handleSubmit = () => {
    if (isFormValid) {
      console.log('Submitting body work photos:', {
        ...savedData,
        photos: photos.map(p => ({ name: p.name, size: p.size, type: p.type }))
      })
      
      // For now, show success message
      alert(`Ολοκληρώθηκε! Στάλθηκαν ${photos.length} φωτογραφίες για αξιολόγηση της ζημιάς`)
    }
  }

  const handleGoBack = () => {
    router.back()
  }

  return (
    <section className="bg-white">
      <div className={`${styles.container} py-24`}>
        <div className="text-center">
          <h1 className={styles.pageTitle}>
            Φωτογραφίες <span className="text-blue-600">Ζημιάς</span>
          </h1>
          <p className={`mt-3 max-w-md mx-auto ${styles.bodyText} sm:text-lg md:mt-5 md:text-xl md:max-w-3xl`}>
            Ανεβάστε 1-3 φωτογραφίες για να αξιολογήσουμε την εργασία που χρειάζεται
          </p>
          
          {/* Show selected car details */}
          <div className={`${styles.cardSimple} mt-8 max-w-md mx-auto`}>
            <h3 className={`${styles.cardTitle} mb-2`}>Επιλεγμένο Όχημα:</h3>
            <p className={styles.smallText}>{savedData.brand} {savedData.model}</p>
            <p className={styles.smallText}>Κατηγορία: Φανοποιεία</p>
          </div>
          
          <div className="mt-8 max-w-lg mx-auto">
            <div className={styles.card}>
              {/* Photo Upload Area */}
              <div className="mb-6">
                <label className={`${styles.label} text-center`}>
                  Φωτογραφίες Ζημιάς ({photos.length}/3):
                </label>
                
                {photos.length < 3 && (
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 ${
                      dragActive 
                        ? 'border-blue-400 bg-blue-50' 
                        : 'border-gray-300 hover:border-blue-400'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <input
                      type="file"
                      id="damage-photos"
                      accept="image/*"
                      multiple
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label htmlFor="damage-photos" className="cursor-pointer">
                      <HiCloudArrowUp className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-lg font-medium text-gray-900">
                        Κάντε κλικ ή σύρετε φωτογραφίες εδώ
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        JPG, PNG μέχρι 10MB ανά φωτογραφία
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Μέχρι {3 - photos.length} ακόμα φωτογραφί{3 - photos.length === 1 ? 'α' : 'ες'}
                      </p>
                    </label>
                  </div>
                )}

                {/* Photo Preview Grid */}
                {photos.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative group">
                        <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                          <img
                            src={URL.createObjectURL(photo)}
                            alt={`Φωτογραφία ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <button
                          onClick={() => removePhoto(index)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600"
                          title="Διαγραφή φωτογραφίας"
                        >
                          <HiXMark className="h-4 w-4" />
                        </button>
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {photo.name}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tips */}
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">💡 Συμβουλές για καλές φωτογραφίες:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Φωτογραφίστε τη ζημιά από κοντά και από μακριά</li>
                  <li>• Χρησιμοποιήστε καλό φωτισμό (φυσικό φως προτιμάται)</li>
                  <li>• Συμπεριλάβετε το περιβάλλον της ζημιάς για πλαίσιο</li>
                </ul>
              </div>
              
              <button 
                onClick={handleSubmit}
                disabled={!isFormValid}
                className={`w-full mt-4 justify-center px-6 py-3 text-base ${
                  isFormValid ? styles.btnPrimary : styles.btnDisabled
                }`}
              >
                <HiArrowRight className="h-5 w-5" />
                Αποστολή για Αξιολόγηση
              </button>
            </div>
            
            <div className="mt-4 text-center">
              <button
                onClick={handleGoBack}
                className="inline-block text-blue-600 hover:text-blue-700 font-medium transition-colors duration-200"
              >
                ← Επιστροφή
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
} 