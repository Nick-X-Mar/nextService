import { HiMagnifyingGlass } from 'react-icons/hi2'

interface CategorySelectorProps {
  selectedCategory: string
  onCategorySelect: (category: string) => void
}

export default function CategorySelector({ selectedCategory, onCategorySelect }: CategorySelectorProps) {
  return (
    <div className="mt-5 max-w-md mx-auto md:mt-8">
      <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
        <label className="block text-gray-700 text-lg font-medium mb-4 text-center">
          Διαλέξτε κατηγορία:
        </label>
        <select 
          value={selectedCategory}
          onChange={(e) => onCategorySelect(e.target.value)}
          className="w-full bg-white border border-gray-300 rounded-md px-4 py-3 text-base font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
        >
          <option value="">Επιλέξτε...</option>
          <option value="service">Service</option>
          <option value="fanopeia">Φανοποιεια</option>
          <option value="oils">Λάδια</option>
          <option value="disk">Δίσκος</option>
        </select>
        
        <div className="mt-4">
          <label className="block text-gray-700 text-base font-medium mb-2">
            Δώστε μας μία μικρή περιγραφή:
          </label>
          <textarea 
            className="w-full bg-white border border-gray-300 rounded-md px-4 py-3 text-base text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 resize-none"
            rows={3}
            placeholder="Θέλω να κάνω service και να δούμε και για δίσκο"
          />
        </div>
        
        <button className="w-full mt-4 bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 rounded-md text-base font-medium transition-colors duration-200 flex items-center justify-center gap-2">
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