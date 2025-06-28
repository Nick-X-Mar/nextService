// Utility for persisting form data across page navigation

export interface ServiceFormData {
  category: string
  description: string
  brand: string
  model: string
  isBrandOther: boolean
  isModelOther: boolean
  customBrand: string
  customModel: string
  // Car specifications (for service/general)
  modelYear: string
  engineCC: string
  engineNumber: string
  // Note: File objects are handled separately since they can't be serialized to localStorage
}

const STORAGE_KEY = 'nextservice-form-data'

export const saveFormData = (data: Partial<ServiceFormData>) => {
  try {
    const existingData = loadFormData()
    const updatedData = { ...existingData, ...data }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData))
  } catch (error) {
    console.error('Failed to save form data:', error)
  }
}

export const loadFormData = (): ServiceFormData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('Failed to load form data:', error)
  }
  
  // Return default values if no data or error
  return {
    category: '',
    description: '',
    brand: '',
    model: '',
    isBrandOther: false,
    isModelOther: false,
    customBrand: '',
    customModel: '',
    modelYear: '',
    engineCC: '',
    engineNumber: ''
  }
}

export const clearFormData = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear form data:', error)
  }
} 