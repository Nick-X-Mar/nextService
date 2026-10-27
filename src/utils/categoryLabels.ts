const categoryLabels: Record<string, string> = {
  service: 'Συντήρηση',
  brakes: 'Φρένα',
  oils: 'Λάδια',
  'allagi-ladion': 'Αλλαγή Λαδιών',
  imantas: 'Ιμάντας',
  symplektis: 'Συμπλέκτης (Δίσκος-πλατό)',
  'oliki-vafi': 'Ολική Βαφή',
  'meriki-vafi': 'Μερική Βαφή',
  aisthitires: 'Αισθητήρες',
  fanopeia: 'Φανοποιεία',
  disk: 'Δισκόφρενα',
  tires: 'Λάστιχα',
  engine: 'Κινητήρας',
  electrical: 'Ηλεκτρικά',
  kteo: 'ΚΤΕΟ',
  elastika: 'Ελαστικά',
}

export function getCategoryText(category: string): string {
  return categoryLabels[category] || category
}

/** What the category pickers (hero, ServiceCategoryModal) offer, in display order. */
export const SERVICE_CATEGORIES = [
  { icon: 'settings', label: 'Συμπλέκτης (Δίσκος-πλατό)', value: 'symplektis' },
  { icon: 'conveyor_belt', label: 'Ιμάντας', value: 'imantas' },
  { icon: 'format_paint', label: 'Ολική Βαφή', value: 'oliki-vafi' },
  { icon: 'brush', label: 'Μερική Βαφή', value: 'meriki-vafi' },
  { icon: 'sensors', label: 'Αισθητήρες', value: 'aisthitires' },
  { icon: 'oil_barrel', label: 'Αλλαγή λαδιών', value: 'allagi-ladion' },
]

/**
 * Every category a new request can carry: the picker's own, plus `service` for
 * general maintenance, which only a hot deal starts. A hot deal's "Πάρε Προσφορά"
 * hands its category to the request form as-is, so a deal must be filed under
 * one of these for the form, the price lookup and the garages' feed to
 * understand it.
 */
export const REQUEST_CATEGORIES = [...SERVICE_CATEGORIES.map((c) => c.value), 'service']
