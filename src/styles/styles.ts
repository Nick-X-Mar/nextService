// NextService Design System - Pure Tailwind Constants
// This file contains reusable Tailwind class combinations for consistency

export const styles = {
  // Brand Colors (change these to update your brand theme everywhere)
  brandPrimary: "orange-400",      // Main brand color - change here to update everywhere
  brandSecondary: "orange-500",    // Darker brand color
  brandLight: "orange-50",         // Light brand background
  brandDark: "orange-600",         // Dark brand color

  // Typography
  pageTitle: "text-4xl font-bold text-gray-900 sm:text-5xl md:text-6xl",
  sectionTitle: "text-3xl font-extrabold text-gray-900",
  cardTitle: "text-lg font-medium text-gray-900",
  bodyText: "text-base text-gray-600",
  smallText: "text-sm text-gray-500",
  titleHighlight: "text-orange-400",    // For highlighted words in titles (uses brandPrimary)
  linkText: "text-orange-500 hover:text-orange-600",  // For clickable links
  featureIcon: "flex items-center justify-center h-12 w-12 rounded-md bg-orange-400 text-white mx-auto",  // For feature section icons

  // Buttons
  btnPrimary: "bg-orange-400 text-white hover:bg-orange-500 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2",
  btnSecondary: "bg-gray-200 text-gray-900 hover:bg-gray-300 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200",
  btnOutline: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200",
  btnDisabled: "bg-gray-300 text-gray-500 cursor-not-allowed px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2",

  // Cards
  card: "bg-white rounded-lg shadow-lg p-6 border border-gray-200",
  cardHover: "bg-white rounded-lg shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-shadow duration-200",
  cardSimple: "bg-white rounded-lg shadow-sm p-4 border border-gray-100",

  // Form Elements
  input: "w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 text-gray-900",
  select: "w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 bg-white text-gray-900",
  textarea: "w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 resize-none text-gray-900",
  label: "block text-sm font-medium text-gray-700 mb-2",

  // Layout
  container: "max-w-6xl mx-auto px-4 sm:px-6 lg:px-8",
  section: "py-16",
  sectionBg: "bg-gray-50",
  pageWrapper: "min-h-screen bg-gray-50",
  pageCenter: "min-h-screen bg-gray-50 flex items-center justify-center",
  loadingSpinner: "animate-spin rounded-full h-8 w-8 border-b-2 border-orange-400 mx-auto mb-4",

  // Navigation
  navLink: "text-gray-700 hover:text-orange-500 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2",
  navButton: "bg-orange-400 text-white hover:bg-orange-500 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2",

  // Chips/Tags
  chip: "bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors duration-200 cursor-pointer",
  chipActive: "bg-orange-400 border-orange-400 text-white px-4 py-2 rounded-full text-sm font-medium cursor-pointer",

  // Mobile
  mobileMenu: "md:hidden bg-white border-t border-gray-200 px-2 pt-2 pb-3 space-y-1",
  mobileMenuButton: "inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-orange-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-400",
  mobileNavLink: "text-gray-700 hover:text-orange-500 hover:bg-gray-100 block px-3 py-2 rounded-md text-base font-medium flex items-center gap-2",

  // Utility
  flexCenter: "flex items-center justify-center",
  flexBetween: "flex items-center justify-between",
  grid3: "grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3",
  fadeIn: "transition-opacity duration-300",
  
  // Shadows
  shadowSm: "shadow-sm",
  shadowMd: "shadow-md",
  shadowLg: "shadow-lg",
  shadowXl: "shadow-xl",
} 