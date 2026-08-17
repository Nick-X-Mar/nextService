// NextService Design System — Material Design 3 Tokens
// All classes reference the MD3 color tokens defined in tailwind.config.js

export const styles = {
  // Brand Colors (semantic references)
  brandPrimary: "primary",
  brandSecondary: "primary-container",
  brandLight: "primary-fixed",
  brandDark: "primary",

  // Typography
  pageTitle: "text-4xl font-black tracking-tight text-on-surface sm:text-5xl",
  sectionTitle: "text-2xl font-bold tracking-tight text-on-surface",
  cardTitle: "text-lg font-bold text-on-surface",
  bodyText: "text-base text-secondary leading-relaxed",
  smallText: "text-sm text-on-surface-variant",
  titleHighlight: "text-primary",
  linkText: "text-primary hover:text-primary-container font-bold",
  featureIcon: "flex items-center justify-center h-14 w-14 rounded-full bg-surface-container text-primary",

  // Label style from designs (uppercase micro text)
  labelUpper: "text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant",
  labelPrimary: "text-[10px] font-bold uppercase tracking-[0.1em] text-primary",

  // Buttons
  btnPrimary: "bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-3 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 shadow-lg shadow-primary/20 flex items-center gap-2",
  btnSecondary: "bg-surface-variant text-on-surface-variant hover:bg-surface-container-high px-4 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 flex items-center gap-2",
  btnOutline: "border border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-surface-container px-4 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 flex items-center gap-2",
  btnDisabled: "bg-surface-container-high text-on-surface-variant/50 cursor-not-allowed px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2",
  btnDanger: "bg-tertiary text-on-tertiary hover:bg-tertiary/90 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 flex items-center gap-2",
  btnGhost: "text-secondary hover:text-on-surface hover:bg-surface-container px-4 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 flex items-center gap-2",

  // Toggle Buttons (segmented controls, fuel type, etc.)
  toggleBtnActive: "flex-1 h-12 rounded-xl font-bold text-xs bg-primary text-on-primary shadow-md shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-transform",
  toggleBtnInactive: "flex-1 h-12 rounded-xl font-bold text-xs bg-surface-container text-secondary hover:bg-surface-variant transition-colors flex items-center justify-center gap-2 active:scale-95 transition-transform",
  toggleContainer: "grid grid-cols-2 gap-3",

  // Pill toggles (smaller, side-by-side)
  pillToggleContainer: "flex bg-surface-container p-1 rounded-full",
  pillToggleActive: "flex-1 py-2 rounded-full font-bold text-[10px] bg-primary text-on-primary shadow-sm text-center",
  pillToggleInactive: "flex-1 py-2 rounded-full font-bold text-[10px] text-secondary text-center",

  // Switch/Toggle Controls
  switchActive: "relative inline-flex h-6 w-11 items-center rounded-full transition-colors bg-primary",
  switchInactive: "relative inline-flex h-6 w-11 items-center rounded-full transition-colors bg-surface-container-highest",
  switchThumbActive: "inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-6",
  switchThumbInactive: "inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-1",
  switchContainer: "flex items-center justify-between",
  switchLabel: "block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant",
  switchDescription: "text-xs text-secondary mt-1",

  // Information Icons & Tooltips
  infoIcon: "h-4 w-4 text-primary cursor-help",
  tooltip: "absolute top-6 left-0 z-50 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-lg p-4 w-64",
  tooltipTitle: "text-sm font-bold text-on-surface mb-2",
  tooltipText: "text-xs text-secondary",
  tooltipImage: "w-full h-32 object-cover rounded-lg mb-2",

  // File Upload
  fileUploadArea: "border-2 border-dashed border-outline-variant/30 rounded-2xl p-8 text-center hover:border-primary transition-colors",
  fileUploadIcon: "h-8 w-8 mx-auto mb-2",
  fileUploadText: "text-sm font-bold",
  fileUploadSubtext: "text-xs text-secondary",
  fileUploadSelected: "text-green-600",
  fileUploadPlaceholder: "text-on-surface-variant",

  // Form Groups & Layout
  fieldGroup: "space-y-3",
  fieldLabel: "block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant",
  fieldLabelWithIcon: "flex items-center gap-2 mb-2",
  fieldContainer: "space-y-3",

  // Cards
  card: "bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10",
  cardHover: "bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 hover:shadow-2xl hover:shadow-on-surface/5 transition-all duration-300",
  cardSimple: "bg-surface-container-low rounded-xl p-5 shadow-sm",

  // Form Elements
  input: "w-full h-14 bg-surface-container-highest border-0 rounded-xl px-4 font-medium text-on-surface focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-all",
  select: "w-full h-14 bg-surface-container-highest border-0 rounded-xl px-4 font-medium text-on-surface focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-all",
  textarea: "w-full bg-surface-container-highest border-0 rounded-xl p-4 font-medium text-on-surface focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-all resize-none",
  label: "block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant",

  // Layout
  container: "max-w-7xl mx-auto px-5 md:px-8",
  section: "py-12",
  sectionBg: "bg-surface-container-low",
  pageWrapper: "min-h-screen bg-surface",
  pageCenter: "min-h-screen bg-surface flex items-center justify-center",
  loadingSpinner: "animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4",

  // Navigation
  navLink: "text-secondary hover:text-on-surface px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-2",
  navButton: "bg-gradient-to-br from-primary to-primary-container text-on-primary px-5 py-2 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 shadow-md flex items-center gap-2",

  // Chips/Tags
  chip: "bg-secondary-container text-on-secondary-container px-5 py-2 rounded-full text-sm font-label uppercase tracking-wider whitespace-nowrap transition-colors hover:bg-surface-container-high cursor-pointer",
  chipActive: "bg-primary text-on-primary px-5 py-2 rounded-full text-sm font-label uppercase tracking-wider whitespace-nowrap cursor-pointer",

  // Status Badges
  statusPending: "text-[0.65rem] font-black uppercase tracking-[0.1em] text-primary bg-primary/10 px-2 py-1 rounded-sm",
  statusInProgress: "text-[0.65rem] font-black uppercase tracking-[0.1em] text-blue-700 bg-blue-100 px-2 py-1 rounded-sm",
  statusAppointment: "text-[0.65rem] font-black uppercase tracking-[0.1em] text-blue-700 bg-blue-100 px-2 py-1 rounded-sm",
  statusCompleted: "text-[0.65rem] font-black uppercase tracking-[0.1em] text-green-700 bg-green-100 px-2 py-1 rounded-sm",
  statusCancelled: "text-[0.65rem] font-black uppercase tracking-[0.1em] text-red-700 bg-red-100 px-2 py-1 rounded-sm",

  // Bento grid for vehicle specs.
  // `min-w-0` on the cell is load-bearing: a grid item's automatic minimum size
  // is its min-content width, so one unbreakable value — a 17-character VIN —
  // would widen its whole column and push its text out past the cell's rounded
  // background. With the floor removed the column can shrink, and `break-words`
  // then wraps that value onto a second line. It only breaks strings that have
  // no other option, so Greek labels like "Χειροκίνητο" still stay whole.
  specGrid: "grid grid-cols-3 gap-2",
  specCell: "bg-surface-container p-2 rounded-lg flex flex-col items-center justify-center min-w-0",
  specLabel: "text-[9px] font-black uppercase text-outline opacity-70",
  specValue: "text-xs font-bold text-center break-words max-w-full",

  // Mobile
  mobileMenu: "md:hidden bg-surface border-t border-outline-variant/20 px-2 pt-2 pb-3 space-y-1",
  mobileMenuButton: "inline-flex items-center justify-center p-2 rounded-lg text-on-surface hover:text-primary hover:bg-surface-container focus:outline-none transition-colors",
  mobileNavLink: "text-on-surface hover:text-primary hover:bg-surface-container block px-3 py-2 rounded-lg text-base font-medium flex items-center gap-2",

  // Utility
  flexCenter: "flex items-center justify-center",
  flexBetween: "flex items-center justify-between",
  grid3: "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3",
  fadeIn: "transition-opacity duration-300",

  // Shadows
  shadowSm: "shadow-sm",
  shadowMd: "shadow-md",
  shadowLg: "shadow-lg",
  shadowXl: "shadow-xl",
}
