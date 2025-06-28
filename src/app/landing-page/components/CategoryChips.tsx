import { styles } from '../../../styles/styles'

interface CategoryChipsProps {
  selectedCategory: string
  onCategorySelect: (category: string) => void
}

export default function CategoryChips({ selectedCategory, onCategorySelect }: CategoryChipsProps) {
  const categories = [
    { value: 'service', label: 'Service' },
    { value: 'fanopeia', label: 'Φανοποιεία' },
    { value: 'oils', label: 'Λάδια' },
    { value: 'disk', label: 'Δίσκος' },
  ]

  return (
    <div className="mb-8">
      <p className={`text-center mb-4 ${styles.smallText}`}>Δημοφιλείς κατηγορίες:</p>
      <div className="flex flex-wrap justify-center gap-3">
        {categories.map((category) => (
          <button
            key={category.value}
            onClick={() => onCategorySelect(category.value)}
            className={selectedCategory === category.value ? styles.chipActive : styles.chip}
          >
            {category.label}
          </button>
        ))}
      </div>
    </div>
  )
} 