# NextService Design System

This folder contains the centralized styling system for NextService. We use **100% pure Tailwind CSS** organized into reusable constants.

## 🎯 Approach: TypeScript Constants (Pure Tailwind)

Our design system uses TypeScript constants that contain **pure Tailwind class strings**. This approach gives us:

- ✅ **100% Tailwind CSS** - All benefits of Tailwind remain
- ✅ **TypeScript IntelliSense** - Autocomplete and type safety
- ✅ **Consistency** - Reusable design patterns
- ✅ **Maintainability** - Change once, update everywhere
- ✅ **Performance** - No additional CSS bundle size
- ✅ **Developer Experience** - Clean, organized code

## 📁 File Structure

```
src/styles/
├── styles.ts       # Main design system constants
└── README.md       # This documentation
```

## 🔧 How to Use

### 1. Import the styles

```tsx
import { styles } from '../styles/styles'
// or
import { styles } from '../../styles/styles'
```

### 2. Use the constants in your components

```tsx
// Typography
<h1 className={styles.pageTitle}>Main Title</h1>
<h2 className={styles.sectionTitle}>Section Title</h2>
<p className={styles.bodyText}>Body text content</p>

// Buttons
<button className={styles.btnPrimary}>Primary Button</button>
<button className={styles.btnSecondary}>Secondary Button</button>

// Form Elements
<input className={styles.input} />
<select className={styles.select}>...</select>
<textarea className={styles.textarea} />
<label className={styles.label}>Label Text</label>

// Cards
<div className={styles.card}>Card content</div>
<div className={styles.cardHover}>Hoverable card</div>

// Layout
<div className={styles.container}>Max-width container</div>
<section className={styles.section}>Section with padding</section>
```

### 3. Combine with additional Tailwind classes

```tsx
// Add additional classes alongside the constants
<h1 className={`${styles.pageTitle} mb-8`}>Title with margin</h1>
<button className={`${styles.btnPrimary} w-full`}>Full width button</button>
<div className={`${styles.card} hover:shadow-xl`}>Enhanced card</div>
```

## 📋 Available Constants

### Typography
- `pageTitle` - Main page titles (responsive)
- `sectionTitle` - Section headings
- `cardTitle` - Card titles
- `bodyText` - Regular text content
- `smallText` - Small text and captions

### Buttons
- `btnPrimary` - Primary action buttons
- `btnSecondary` - Secondary buttons
- `btnOutline` - Outline style buttons

### Form Elements
- `input` - Text inputs
- `select` - Select dropdowns
- `textarea` - Text areas
- `label` - Form labels

### Cards
- `card` - Standard cards
- `cardHover` - Cards with hover effects
- `cardSimple` - Simple card variant

### Navigation
- `navLink` - Navigation links
- `navButton` - Navigation buttons
- `mobileMenu` - Mobile menu container
- `mobileMenuButton` - Mobile menu toggle
- `mobileNavLink` - Mobile navigation links

### Chips/Tags
- `chip` - Default chip style
- `chipActive` - Active/selected chip

### Layout
- `container` - Max-width containers
- `section` - Section spacing
- `grid3` - 3-column responsive grid
- `flexCenter` - Centered flex
- `flexBetween` - Space-between flex

## 🎨 Design Tokens

All our design is based on consistent tokens:

- **Colors**: Blue theme (`blue-600`, `blue-700`)
- **Spacing**: Consistent padding and margins
- **Typography**: Clear hierarchy with font weights
- **Shadows**: Consistent shadow levels
- **Borders**: Rounded corners and border styles
- **Transitions**: Smooth hover effects

## ✨ Benefits Over Other Approaches

### vs. CSS Classes
- ✅ No CSS compilation issues
- ✅ No risk of visual bugs
- ✅ Full Tailwind intellisense

### vs. Tailwind Config Extensions
- ✅ Simpler to maintain
- ✅ No build configuration needed
- ✅ Works with any Tailwind setup

### vs. CSS-in-JS
- ✅ No runtime performance cost
- ✅ Better build-time optimization
- ✅ Smaller bundle size

## 🔄 Updating Styles

To update a style pattern:

1. Modify the constant in `styles.ts`
2. The change applies everywhere that constant is used
3. No need to search and replace across files

Example:
```tsx
// Before
btnPrimary: "bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-md..."

// After - adding shadow
btnPrimary: "bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-md shadow-md..."
```

## 🚀 Best Practices

1. **Always use constants** for repeating patterns
2. **Combine with additional classes** when needed
3. **Add new constants** for new patterns instead of inline styles
4. **Keep it pure Tailwind** - don't mix with custom CSS
5. **Use TypeScript** to catch typos and get autocomplete

## 🔍 Example Component

```tsx
import { styles } from '../styles/styles'

export default function ExampleCard() {
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Card Title</h3>
      <p className={styles.bodyText}>Card description text</p>
      <button className={`${styles.btnPrimary} mt-4`}>
        Action Button
      </button>
    </div>
  )
}
```

This approach keeps all the power of Tailwind while providing the consistency and maintainability of a design system! 🎉