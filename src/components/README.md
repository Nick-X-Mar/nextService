# Design System Components

This directory contains reusable UI components that follow consistent design patterns and provide a unified user experience across the application.

## 🎯 **Core Principles**

- **Consistency**: All components follow the same design language
- **Accessibility**: Built with ARIA attributes and keyboard navigation
- **Flexibility**: Configurable through props while maintaining consistency
- **Performance**: Optimized for reusability and minimal bundle impact

## 📚 **Available Components**

### 🎨 **Layout & Structure**
- **`Card`** - Content containers with consistent padding and styling
- **`Modal`** - Popup dialogs with backdrop and keyboard support

### 🎛️ **Interactive Elements**
- **`Button`** - All button variations (primary, secondary, danger, etc.)
- **`Checkbox`** - Form checkboxes with labels
- **`Switch`** - Toggle switches for on/off states
- **`Input`** - Text inputs with validation and error states

### 📝 **Typography**
- **`Title`** - Page and section titles with consistent hierarchy
- **`Text`** - Body text with various sizes and colors

### 🏷️ **Status & Indicators**
- **`Badge`** - Status indicators and tags

## 🚀 **Usage Examples**

### Import Components
```tsx
import { Button, Title, Text, Card, Modal } from '@/components'
```

### Button Examples
```tsx
// Primary button
<Button variant="primary" size="md" onClick={handleClick}>
  Submit
</Button>

// Secondary button with loading state
<Button variant="secondary" loading={isLoading}>
  Save Changes
</Button>

// Danger button
<Button variant="danger" size="sm">
  Delete
</Button>
```

### Title Examples
```tsx
// Page title
<Title level={1} variant="page" highlight>
  Welcome to NextService
</Title>

// Section title
<Title level={2} variant="section">
  Service Requests
</Title>
```

### Text Examples
```tsx
// Body text
<Text variant="body">
  This is regular body text
</Text>

// Muted text
<Text variant="small" color="muted">
  Additional information
</Text>
```

### Form Components
```tsx
// Input with label and error
<Input
  label="Email Address"
  value={email}
  onChange={setEmail}
  error={emailError}
  required
/>

// Checkbox
<Checkbox
  checked={isAgreed}
  onChange={setIsAgreed}
  label="I agree to the terms"
/>

// Switch
<Switch
  checked={isEnabled}
  onChange={setIsEnabled}
  label="Enable notifications"
/>
```

### Card Examples
```tsx
// Default card
<Card>
  <Title level={3}>Card Title</Title>
  <Text>Card content goes here</Text>
</Card>

// Elevated card with hover
<Card variant="elevated" hover>
  <Text>Hoverable card</Text>
</Card>
```

### Modal Examples
```tsx
<Modal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  title="Confirmation"
  size="md"
>
  <Text>Are you sure you want to continue?</Text>
</Modal>
```

## 🎨 **Design Tokens**

### Colors
- **Primary**: Orange (#ea580c, #c2410c)
- **Secondary**: Gray (#6b7280, #374151)
- **Success**: Green (#16a34a, #15803d)
- **Warning**: Yellow (#ca8a04, #a16207)
- **Danger**: Red (#dc2626, #b91c1c)

### Sizes
- **Small**: 12px, 14px
- **Medium**: 16px, 18px
- **Large**: 20px, 24px

### Spacing
- **Small**: 8px, 12px
- **Medium**: 16px, 20px
- **Large**: 24px, 32px

## ♿ **Accessibility Features**

- **Keyboard Navigation**: All interactive components support keyboard navigation
- **ARIA Attributes**: Proper labeling and state announcements
- **Focus Management**: Clear focus indicators and logical tab order
- **Screen Reader Support**: Semantic HTML and descriptive labels

## 🔧 **Customization**

All components accept a `className` prop for additional styling:

```tsx
<Button className="my-custom-class">
  Custom Button
</Button>
```

## 📱 **Responsive Design**

Components are built with mobile-first responsive design:
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Touch-friendly sizing for mobile devices
- Adaptive layouts for different screen sizes

## 🧪 **Testing**

Components are designed to be easily testable:
- Clear prop interfaces
- Predictable behavior
- Minimal side effects
- Accessible selectors

## 🔄 **Migration Guide**

When refactoring existing code to use these components:

1. **Identify** repeated UI patterns
2. **Replace** with appropriate component
3. **Update** styling to use component props
4. **Test** functionality remains the same
5. **Remove** old custom styling

## 📈 **Performance**

- **Tree Shaking**: Components are individually exportable
- **Minimal Dependencies**: No external UI library dependencies
- **Optimized Rendering**: Efficient re-rendering patterns
- **Bundle Size**: Lightweight implementation
