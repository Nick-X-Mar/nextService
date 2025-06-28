interface CategoryChipsProps {
  selectedCategory: string
  onCategorySelect: (category: string) => void
}

export default function CategoryChips({ selectedCategory, onCategorySelect }: CategoryChipsProps) {
  const categories = [
    { value: 'service', label: 'Service' },
    { value: 'fanopeia', label: 'Φανοποιεια' },
    { value: 'oils', label: 'Λάδια' },
    { value: 'disk', label: 'Δίσκος' },
  ]

  return (
    <div className="mb-8">
      <p className="text-center text-gray-600 mb-4 text-sm">Δημοφιλείς κατηγορίες:</p>
      <div className="flex flex-wrap justify-center gap-3">
        {categories.map((category) => (
          <button
            key={category.value}
            onClick={() => onCategorySelect(category.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border ${
              selectedCategory === category.value
                ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>
    </div>
  )
} 