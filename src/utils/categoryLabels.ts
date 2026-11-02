const categoryLabels: Record<string, string> = {
  service: 'Τακτικό service αυτοκινήτου',
  brakes: 'Φρένα',
  oils: 'Λάδια',
  'allagi-ladion': 'Αλλαγή λαδιών',
  imantas: 'Αλλαγή ιμάντα χρονισμού',
  symplektis: 'Αλλαγή δίσκου πλατό',
  'oliki-vafi': 'Ολική βαφή αυτοκινήτου',
  'meriki-vafi': 'Μερική βαφή αυτοκινήτου',
  aisthitires: 'Τοποθέτηση αισθητήρων παρκαρίσματος',
  fanopeia: 'Φανοποιεία',
  disk: 'Δισκόφρενα',
  tires: 'Λάστιχα',
  engine: 'Κινητήρας',
  electrical: 'Ηλεκτρικά',
  kteo: 'ΚΤΕΟ',
  elastika: 'Ελαστικά',
  other: 'Άλλη εργασία',
}

/**
 * Where a request goes when the client wrote or dictated what they need instead
 * of picking from the list. The text is its description. It is not one of the
 * pickers' categories, and it asks for everything a mechanical job does.
 */
export const OTHER_CATEGORY = 'other'

export function getCategoryText(category: string): string {
  return categoryLabels[category] || category
}

/** What the category pickers (hero, ServiceCategoryModal) offer, in display order. */
export const SERVICE_CATEGORIES = [
  { icon: 'settings', label: 'Αλλαγή δίσκου πλατό', value: 'symplektis' },
  { icon: 'conveyor_belt', label: 'Αλλαγή ιμάντα χρονισμού', value: 'imantas' },
  { icon: 'build', label: 'Τακτικό service αυτοκινήτου', value: 'service' },
  { icon: 'format_paint', label: 'Ολική βαφή αυτοκινήτου', value: 'oliki-vafi' },
  { icon: 'brush', label: 'Μερική βαφή αυτοκινήτου', value: 'meriki-vafi' },
  { icon: 'sensors', label: 'Τοποθέτηση αισθητήρων παρκαρίσματος', value: 'aisthitires' },
  { icon: 'oil_barrel', label: 'Αλλαγή λαδιών', value: 'allagi-ladion' },
]

/**
 * Every category a new request can carry — exactly the picker's. A hot deal's
 * "Πάρε Προσφορά" hands its category to the request form as-is, so a deal must
 * be filed under one of these for the form, the price lookup and the garages'
 * feed to understand it.
 */
export const REQUEST_CATEGORIES = SERVICE_CATEGORIES.map((c) => c.value)
