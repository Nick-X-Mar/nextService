const categoryLabels: Record<string, string> = {
  service: 'Συντήρηση',
  brakes: 'Φρένα',
  oils: 'Λάδια',
  'allagi-ladion': 'Αλλαγή Λαδιών',
  imantas: 'Ιμάντας',
  symplektis: 'Συμπλέκτης',
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
