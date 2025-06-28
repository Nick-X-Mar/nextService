'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HiMagnifyingGlass } from 'react-icons/hi2'
import { styles } from '../../styles/styles'
import { saveFormData, loadFormData } from '../../utils/formStorage'

interface CategorySelectorProps {
  selectedCategory: string
  onCategorySelect: (category: string) => void
}

export default function CategorySelector({ selectedCategory, onCategorySelect }: CategorySelectorProps) {
  const [description, setDescription] = useState('')
  const [mounted, setMounted] = useState(false)
  const router = useRouter()

  // Load saved data on component mount
  useEffect(() => {
    setMounted(true)
    const savedData = loadFormData()
    if (savedData.category) {
      onCategorySelect(savedData.category)
    }
    if (savedData.description) {
      setDescription(savedData.description)
    }
  }, [onCategorySelect])

  // Save data whenever it changes
  useEffect(() => {
    if (mounted) {
      saveFormData({
        category: selectedCategory,
        description: description
      })
    }
  }, [selectedCategory, description, mounted])

  const isFormValid = selectedCategory.trim() !== '' || description.trim() !== ''

  const handleSubmit = () => {
    if (isFormValid) {
      // Save current data before navigation
      saveFormData({
        category: selectedCategory,
        description: description
      })
      router.push('/car-details')
    }
  }
  return (
    <div className="mt-5 max-w-md mx-auto md:mt-8">
      <div className={styles.card}>
        <label className={`${styles.label} text-lg text-center`}>
          Διαλέξτε κατηγορία:
        </label>
        <select 
          value={selectedCategory}
          onChange={(e) => onCategorySelect(e.target.value)}
          className={styles.select}
        >
          <option value="">Επιλέξτε...</option>
          <option value="service">Service</option>
          <option value="fanopeia">Φανοποιεια</option>
          <option value="oils">Λάδια</option>
          <option value="disk">Δίσκος</option>
        </select>
        
        <div className="mt-4">
          <label className={styles.label}>
            Δώστε μας μία μικρή περιγραφή:
          </label>
          <textarea 
            className={styles.textarea}
            rows={3}
            placeholder="Θέλω να κάνω service και να δούμε και για δίσκο"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        
        <button 
          onClick={handleSubmit}
          disabled={!isFormValid}
          className={`w-full mt-4 justify-center px-6 py-3 text-base ${
            isFormValid 
              ? styles.btnPrimary 
              : styles.btnDisabled
          }`}
        >
          <HiMagnifyingGlass className="h-5 w-5" />
          Αναζήτηση
        </button>
      </div>
      <div className="mt-4 text-center">
        <a
          href="/register-professional"
          className="inline-block text-blue-600 hover:text-blue-700 font-medium transition-colors duration-200"
        >
          Γίνε Επαγγελματίας →
        </a>
      </div>
    </div>
  )
} 