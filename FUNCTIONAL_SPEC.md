# NextService — Functional Specification

This document describes every feature, screen, form field, and data entity in the NextService platform. It is intended for UI designers and developers building the interface.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [User Types & Auth](#2-user-types--auth)
3. [Landing Page](#3-landing-page)
4. [Service Request Creation Flow (Multi-Step)](#4-service-request-creation-flow)
5. [Client Pages](#5-client-pages)
6. [Garage Dashboard](#6-garage-dashboard)
7. [Chat System](#7-chat-system)
8. [Data Entities & Field Reference](#8-data-entities--field-reference)
9. [Status Definitions](#9-status-definitions)
10. [Service Categories](#10-service-categories)
11. [Car Brands & Models Reference](#11-car-brands--models-reference)

---

## 1. Platform Overview

NextService is a Greek car service marketplace. **Clients** (vehicle owners) submit service requests describing what their car needs. **Garages** (professionals) see incoming requests, make offers, chat with clients, and schedule appointments. All UI text is in Greek.

### Core Flow
```
Client submits request → Garages see it → Garage sends offer → Client accepts offer → Appointment scheduled → Chat for coordination
```

---

## 2. User Types & Auth

### 2.1 Two User Types

| Aspect | Client (Πελάτης) | Garage (Συνεργείο) |
|--------|-------------------|---------------------|
| Role | Vehicle owner seeking service | Professional garage offering service |
| Entry point | Landing page / Login | Login / Professional Registration |
| Dashboard | `/requests/{clientId}` | `/garage-dashboard/{garageId}` |
| Navigation | ClientNavigation | GarageNavigation |
| Auth key stored | `clientId` in localStorage | `garageId` in localStorage |

### 2.2 Login Page (`/login`)

**Form Fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Email | email input | Yes | Trimmed and lowercased before submission |
| User Type | segmented control | Yes | Two options: "Πελάτης" (Client) / "Συνεργείο" (Garage) |

**Flow:**
1. User enters email and selects user type
2. If found → logged in, redirected to dashboard
3. If not found → shown options:
   - **Client**: "Δημιουργία Νέου Λογαριασμού" (Create Account) — creates account with email, auto-logs in
   - **Garage**: "Εγγραφή ως Συνεργείο" (Register as Garage) — redirects to `/register-professional`

**Rate Limiting:** 5 login attempts per IP per hour, 3 per email per hour.

### 2.3 Client Registration

Clients can register in two ways:
- **From login page**: Just email required. First name defaults to "Επισκέπτης" (Guest).
- **From service request flow**: Guest client is auto-created when submitting a request. Later, they can register with full details from the requests page.

**Registration from Requests** — additional fields collected:

| Field | Type | Required |
|-------|------|----------|
| First Name (Όνομα) | text | Yes |
| Last Name (Επώνυμο) | text | No |
| Email | email | Yes |
| Phone Number (Τηλέφωνο) | tel | No |

**Vehicle Deduplication**: When a client registers, the system checks if they already exist by email. If so, it merges their guest vehicles (matching by VIN or Engine Number) and transfers service requests to the existing account.

### 2.4 Garage Registration (`/register-professional`)

**Form Fields:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Επωνυμία Εταιρείας (Company Name) | text | Yes | Non-empty |
| ΑΦΜ (TIN) | text | Yes | Exactly 9 digits |
| Email | email | Yes | Valid email format |
| ΔΟΥ (Tax Authority) | text | Yes | Non-empty (e.g., "ΔΟΥ Αθηνών") |
| Διεύθυνση (Address) | text | Yes | Non-empty |
| Κινητό (Mobile) | tel | Yes | Greek format: 10 digits, can start with +30 or 0 |

**After Registration:**
- Account created with `isActive: false` (requires manual approval)
- Success page shown: "Θα επικοινωνήσουμε μαζί σας σύντομα για την ενεργοποίηση" (We will contact you soon for activation)
- User must log in separately after approval

**Unique Constraint:** TIN must be unique across all garages (returns error if duplicate).

---

## 3. Landing Page (`/`)

Four sections from top to bottom:

### 3.1 Hero Section
- **Headline:** "Βρείτε τον καλύτερο επαγγελματία" (Find the best professional)
- **Subtitle:** Platform benefits description
- Contains the **Category Selector** form (the entry point for creating service requests)

### 3.2 Category Selector (embedded in Hero)

This is the **Step 1** of the service request flow. Fields:

| Field | Type | Required | Options |
|-------|------|----------|---------|
| Κατηγορία (Category) | dropdown | Yes* | `service`, `fanopeia` (body work), `oils`, `disk` (brakes) |
| Μάρκα (Brand) | dropdown | Yes | 24 predefined brands + "Άλλο" (Other) for custom text input |
| Μοντέλο (Model) | dropdown | Yes | Dynamic list based on brand + "Άλλο" (Other) for custom text input |
| Περιγραφή (Description) | textarea | Yes* | Free text describing the service needed |

*At least one of Category or Description must be filled.

**Validation:** Form is valid when `(category OR description is non-empty) AND brand is non-empty AND model is non-empty`.

**On submit:** Saves data to localStorage, navigates to `/car-details`.

### 3.3 Offers Section
- Grid of promotional offer cards (1/2/3 columns responsive)
- Each card: image, title, description, "Περισσότερα" (More) button

### 3.4 Features Section
Three feature cards:
1. **Εύκολη Αναζήτηση** (Easy Search) — Find professionals quickly
2. **Επαληθευμένοι Επαγγελματίες** (Verified Professionals) — All verified and rated
3. **Γρήγορη Επικοινωνία** (Fast Communication) — Direct communication

### 3.5 Professional Section (CTA for garages)
- **Headline:** "Είστε Επαγγελματίας;" (Are you a Professional?)
- Three benefits:
  1. **Νέοι Πελάτες** (New Customers) — Receive notifications for requests
  2. **Διαχείριση Εύκολη** (Easy Management) — Manage offers and appointments
  3. **Ειδικότητες** (Specialties) — Select specialties for relevant requests
- CTA button: "Εγγραφή Επαγγελματία" → `/register-professional`

---

## 4. Service Request Creation Flow

A **3-step form** that persists all data in localStorage between steps.

### 4.1 Step 1: Category & Car Selection (Landing Page)
See [Category Selector](#32-category-selector-embedded-in-hero) above.

### 4.2 Step 2: Car Technical Specs (`/car-details`)

| Field | Type | Required | Validation / Options |
|-------|------|----------|----------------------|
| Έτος Μοντέλου (Model Year) | text input | Yes | Exactly 4 digits (e.g., 2020) |
| Κυβισμός (Engine CC) | text input | Yes | Number between 100–9999 |
| Καύσιμο (Fuel Type) | segmented control | Yes | `petrol` (default) / `diesel` |
| Μετάδοση (Transmission) | segmented control | No | Manual (default) / Automatic |
| Κίνηση (Drive) | segmented control | No | 2WD (default) / 4x4 |
| Turbo | segmented control | No | No (default) / Yes |

**Validation:** Form valid when `engineCC is 100–9999 AND modelYear is 4 digits AND fuelType is selected`.

**On submit:** Saves to localStorage. Routes based on category:
- If `fanopeia` → Step 3B (Body Work Photos)
- Otherwise → Step 3A (Car Specs)

### 4.3 Step 3A: Car Identification — Regular Services (`/car-specifications`)

For categories: `service`, `oils`, `disk`.

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| VIN Number | text input (auto-uppercase) | Yes | Max 17 characters |
| Engine Number OR License Photo | toggle between text / file upload | Yes (one of them) | Text: alphanumeric; File: image, max 10MB |

**Engine Number / License Photo toggle:**
- **Option 1 — Engine Number:** Text input, placeholder "π.χ. ABC123456"
- **Option 2 — License Photo:** File upload, accepts `image/*`, max 10MB (JPEG/PNG/JPG)

**Price Estimation:** Automatically calculated and displayed based on vehicle specs (brand, model, year, CC, fuel type). Shows estimated cost in an orange info card.

**On submit:** Creates service request + vehicle + guest client in DynamoDB. Redirects to `/requests/{clientId}`.

### 4.4 Step 3B: Body Work Photos — Fanopeia Only (`/car-specifications`)

For category: `fanopeia`.

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| Damage Photos | drag-and-drop file upload | Yes (min 1) | 1–3 photos max, image files only, max 10MB each (JPEG/PNG/JPG) |

**Photo Upload Features:**
- Drag-and-drop zone with visual feedback
- Click to browse files
- Multiple file selection supported
- Preview grid with thumbnails
- Remove button (hover, click X)
- Progress indicator: "{count}/3"

**Tips displayed:**
- Photograph damage from close and far
- Use good lighting (prefer natural light)
- Include surroundings for context

**On submit (2-step):**
1. POST service request to API (creates request, vehicle, guest client)
2. POST photos to S3 via upload API
3. Redirect to `/requests/{clientId}`

### 4.5 Form Data Persistence (localStorage)

All fields across all steps are stored in a single localStorage object (`nextservice-form-data`). Complete shape:

```
category, description, brand, model, isBrandOther, isModelOther, customBrand, customModel,
modelYear, engineCC, fuelType, isAutomatic, is4x4, vinNumber, engineNumber,
estimatedPrice, originalVehicleId, originalVehicleData
```

Form data is cleared after successful submission.

### 4.6 Guest User Flow

When a non-logged-in user submits a request:
1. A guest client record is created (firstName: "Επισκέπτης")
2. `pendingRegistrationData` is saved in localStorage (vehicleData, serviceRequestId, clientId, timestamp — expires after 1 hour)
3. When the guest later logs in or registers, the system links their guest data to their real account

---

## 5. Client Pages

### 5.1 Client Navigation Bar

Sticky top navigation (visible on all client pages):

| Item | Label | Route |
|------|-------|-------|
| 1 | Νέο Αίτημα (New Request) | `/` |
| 2 | Αιτήματα (Requests) | `/requests/{clientId}` |
| 3 | Ραντεβού (Appointments) | `/requests/{clientId}?tab=appointment` |
| 4 | Συνομιλίες (Chats) | `/requests/{clientId}/chats` |
| 5 | Προφίλ (Profile) | `/profile/{clientId}` |

### 5.2 Requests Page (`/requests/{clientId}`)

**3 Tabs:**

| Tab | Label | Statuses Shown |
|-----|-------|----------------|
| 1 | Αιτήματα (Open Requests) | PENDING + IN_PROGRESS |
| 2 | Ραντεβού (Appointments) | APPOINTMENT (future dates first) |
| 3 | Κλειστά (Closed) | COMPLETED + CANCELLED |

**Request Card — fields displayed:**

| Field | Notes |
|-------|-------|
| Status Badge | Color-coded (see [Status Definitions](#9-status-definitions)) |
| Vehicle | Brand, Model, Year |
| Category | Service type name |
| Description | Truncated preview |
| Creation Date | Formatted date + time |
| Estimated Cost | If available, shown in € |
| Photos Count | Badge with count |
| Appointment Date | Only for APPOINTMENT status, prominent display |
| Appointment Price | Only for APPOINTMENT status, shown in orange € |

**Action buttons per card:**
- "Λεπτομέρειες" (Details) → opens detail modal
- "Συνομιλία" (Chat) → opens chat (only if messages exist)

### 5.3 Request Details Modal

Opened from request card. Contains:

**Section 1 — Request Information:**
- Category (editable dropdown)
- Description (editable textarea)
- Status badge

**Section 2 — Vehicle Details:**
- Brand, Model, Year, License Plate, Color, Nickname
- Engine CC, Fuel Type, Transmission, Drive (2WD/4x4)
- VIN Number, Engine Number

**Section 3 — Offers from Garages:**
For each offer received:

| Field | Notes |
|-------|-------|
| Garage Name | Company name |
| Garage Address | Area/location |
| Garage Phone | Contact number |
| Offer Amount | Displayed in € |
| Offer Status | Pending/Accepted/Rejected |

**Date Selection Interface (for accepting an offer):**
- Pre-set quick buttons: "Next available", "Tomorrow", "+1 week", "+2 weeks"
- Custom date picker: Select up to **5 dates** for availability
- "Accept" button to confirm appointment with selected dates

**Section 4 — Photos:**
- Photo thumbnails attached to request

### 5.4 Profile Page (`/profile/{clientId}`)

#### User Information Section

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Όνομα (First Name) | text | Yes | |
| Επώνυμο (Last Name) | text | No | |
| Email | email | No | |
| Τηλέφωνο (Phone Number) | tel | No | |
| Διεύθυνση (Address) | text | No | |

Edit/Save/Cancel toggle mode.

#### Vehicles Section

Carousel navigation for multiple vehicles: "< X of Y >".

Quick action button: "Νέο Αίτημα για αυτό το Όχημα" (New Request for this Vehicle).

**Vehicle Card — 3 subsections:**

**Βασικές Πληροφορίες (Basic Information):**

| Field | Type | Notes |
|-------|------|-------|
| Μάρκα (Brand) | text | |
| Μοντέλο (Model) | text | |
| Έτος Κατασκευής (Model Year) | text | |
| Χρώμα (Color) | text | |
| Πινακίδα (License Plate) | text | |
| Ψευδώνυμο (Nickname) | text | Optional, user-defined label |

**Τεχνικά Χαρακτηριστικά (Technical Specifications):**

| Field | Type | Options |
|-------|------|---------|
| Κυβισμός cc (Engine CC) | text | |
| Καύσιμο (Fuel Type) | dropdown | Βενζίνη (Petrol), Ντίζελ (Diesel), Ηλεκτρικό (Electric), Υβριδικό (Hybrid) |
| Μετάδοση (Transmission) | toggle | Χειροκίνητο (Manual) / Αυτόματο (Automatic) |
| 4WD | toggle | Yes / No |

**Αριθμοί Αναγνώρισης (Identification Numbers):**

| Field | Type |
|-------|------|
| VIN Number | text |
| Αριθμός Κινητήρα (Engine Number) | text |

All vehicle fields are editable in edit mode with Save/Cancel.

---

## 6. Garage Dashboard

### 6.1 Garage Navigation Bar

Sticky top navigation:

| Item | Label | Route |
|------|-------|-------|
| 1 | Νέα Αιτήματα (New Requests) | `?tab=requests` |
| 2 | Προσφορές από Εμένα (My Offers) | `?tab=offers` |
| 3 | Ραντεβού (Appointments) | `?tab=appointments` |
| 4 | Ανοιχτές Συνομιλίες (Open Chats) | `/chats` |
| 5 | Συνομιλίες με Ραντεβού (Appointment Chats) | `/chats/appointments` |
| 6 | Ρυθμίσεις Συνεργείου (Garage Settings) | `?tab=settings` |

Header shows: Orange wrench icon + company name + "Συνεργείο" subtitle.

### 6.2 Tab 1: Available Requests (Νέα Αιτήματα)

Shows PENDING service requests that this garage has **not yet made an offer for**.

**Filtering:** By category (All, Service, Brakes, Tires, Engine, Electrical, Oils).

**Per Request Card — fields displayed:**

| Field | Notes |
|-------|-------|
| Vehicle | Brand, Model |
| Service Category | With icon if photos exist |
| Model Year | |
| Fuel Type | Βενζίνη/Πετρέλαιο/Ηλεκτρικό/Υβριδικό/Υγραέριο |
| Engine CC | |
| Transmission | Automatic / Manual |
| 4x4 | Yes / No |
| Turbo | Yes / No |
| VIN Number | If available |
| Engine Number | If available |
| Client Name | First + Last name |
| Client Phone | |
| Service Description | Full text |
| Creation Date | |
| Photo Indicator | Green checkmark if photos attached |

**Action buttons:**
- "Κάνε Προσφορά" (Make Offer) → navigates to offer form
- "Συνομιλία" (Chat) → opens chat with client

### 6.3 Tab 2: My Offers (Προσφορές από Εμένα)

Shows all offers made by this garage.

**Filtering:** All / Pending / Rejected (excludes accepted offers with appointment dates — those appear in Appointments tab).

**Per Offer Card — fields displayed:**

| Field | Notes |
|-------|-------|
| Vehicle | Brand, Model, Year |
| Status Badge | Color-coded: Yellow (Pending), Green (Accepted), Red (Rejected), Gray (Expired) |
| Client Name | |
| Service Description | |
| Service Category | |
| Offer Price | Displayed prominently in orange (€) |
| Offer Description | |
| Created Date | |
| Appointment Date | If accepted and date set |

**Behavior by status:**
- PENDING → clickable, can edit
- REJECTED → grayed out, read-only
- ACCEPTED (no appointment date) → shown here
- ACCEPTED (with appointment date) → shown in Appointments tab instead

### 6.4 Tab 3: Appointments (Ραντεβού)

Shows accepted offers with confirmed appointment dates (today or future only).

**Per Appointment Card — fields displayed:**

| Field | Notes |
|-------|-------|
| Vehicle | Brand, Model, Year |
| Appointment Date | Prominent blue box with calendar icon, formatted with day of week |
| Client Name | |
| Client Phone | |
| Service Description | |
| Service Category | |
| Price | appointmentPrice or offerAmount, in € |
| Offer Description | |
| Created Date | |

Sorted by appointment date (earliest first).

**Action:** "Άνοιγμα Συνομιλίας" (Open Chat) button on each card.

### 6.5 Tab 4: Garage Settings (Ρυθμίσεις Συνεργείου)

**Company Information Fields:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Επωνυμία Εταιρείας (Company Name) | text | Yes | Non-empty |
| ΑΦΜ (TIN) | text | Yes | 9 digits |
| Email | email | Yes | Valid email format |
| Κινητό Τηλέφωνο (Mobile Phone) | tel | Yes | |
| Διεύθυνση (Address) | text | Yes | |
| ΔΟΥ (Tax Authority) | text | Yes | |
| Περιγραφή (Description) | textarea | No | |

**Benefits Management:**
- Dynamic list of benefits (free services offered to clients)
- Add new benefit via text input
- Each benefit shown as a removable chip/tag
- Examples: "24-hour service", "free pickup"

Save/Cancel buttons appear only when changes are detected.

### 6.6 Create / Edit Offer (`/garage-dashboard/{garageId}/offers/{requestId}`)

**Section 1 — Client Details Card:**

| Field | Display |
|-------|---------|
| Client Name | First + Last |
| Phone Number | |
| Email | If available |
| Chat button | Opens conversation |

**Section 2 — Request Details Card:**
- Full vehicle specs card (brand, model, CC, year, fuel, transmission, 4x4, turbo, VIN, engine number)
- Service category
- Service description
- Estimated cost
- Photo count indicator

**Section 3 — Offer Form:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Αριθμός Προσφοράς (Offer Number) | text (auto-generated, disabled) | — | Format: `Offer_DDMMYY_X` |
| Ποσό Εκτίμησης (Estimated Cost) | number (disabled) | — | From request |
| Ποσό Προσφοράς (Offer Amount) | number input | Yes | The garage's proposed price in € |
| Ημερομηνία (Date) | text (disabled) | — | Today's date, auto-filled |

**Section 4 — Availability Calendar:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| Available Dates | calendar (multi-select) | Yes (min 1) | Monday–Friday only; tomorrow through 2 weeks out; weekends disabled; past dates disabled |

Selected dates shown as orange chips below the calendar. Format: "dd/MM/yyyy (Day)" in Greek.

**Section 5 — Benefits (if garage has any):**
- Checkboxes for each garage benefit
- All pre-selected by default
- Can toggle on/off per offer

**Actions:**
- "Αποστολή Προσφοράς" (Send Offer) — for new offers
- "Ενημέρωση Προσφοράς" (Update Offer) — for existing offers (disabled if no changes)
- Cancel → return to dashboard

---

## 7. Chat System

Real-time messaging between clients and garages. Uses REST API for persistence (DynamoDB) and AWS AppSync WebSocket for live updates.

### 7.1 Client Chat Views

#### Chat Listing (`/requests/{clientId}/chats`)

**3 Tabs:**

| Tab | Label | Content |
|-----|-------|---------|
| 1 | Εκκρεμείς Συνομιλίες (Pending Chats) | PENDING status requests with messages |
| 2 | Ραντεβού (Appointments) | APPOINTMENT status, sorted by date |
| 3 | Απορριφθείσες Προσφορές (Rejected) | Conversations where offer wasn't accepted |

**Per Chat Card:**

| Field | Notes |
|-------|-------|
| Status Badge | Color-coded |
| Vehicle | Brand, Model, Year |
| Category | |
| Description | Preview |
| Last Message | Sender indicator + content preview + timestamp |
| Unread Count | Red badge |
| Price | Appointment price or estimated cost |
| "Άνοιγμα Συνομιλίας" button | |

#### Individual Client Chat (`/requests/{clientId}/chats/{requestId}`)

**Layout: Split View**

**Left Sidebar — Garage List:**
- Garage logo/initials avatar
- Company name
- Last message preview
- Unread indicator (!)

**Right Panel — Chat Area:**
- **Header:** Selected garage name
- **Messages:** Bubbles with alignment (client: orange/right, garage: gray/left), timestamps, date separators
- **Input:** Text field + send button. Enter to send, Shift+Enter for newline.
- **Read-only mode:** When status is APPOINTMENT, input replaced with blue notice: "Η συνομιλία είναι μόνο για ανάγνωση επειδή έχει προγραμματιστεί ραντεβού."

### 7.2 Garage Chat Views

#### Open Chats (`/garage-dashboard/{garageId}/chats`)
- Shows PENDING or IN_PROGRESS requests where garage has made offers
- Same card format as client chats (status, vehicle, category, last message, unread count)

#### Appointment Chats (`/garage-dashboard/{garageId}/chats/appointments`)
- Shows APPOINTMENT status requests with future appointment dates
- Sorted by appointment date (earliest first)
- Prominent blue appointment date box on each card

#### Individual Garage Chat (`/garage-dashboard/{garageId}/chat/{requestId}`)
- **Header:** "Συνομιλία με {clientName}" + "{brand} {model} - {category}"
- **Request context panel** showing full request details
- **Message area:** Client messages left/gray, garage messages right/orange
- **Message input:** Same as client (disabled in APPOINTMENT status)
- **Real-time:** AppSync subscription on channel `request-{requestId}-garage-{garageId}`

### 7.3 Chat Message Fields

| Field | Type | Notes |
|-------|------|-------|
| Message content | text | The message body |
| Sender Name | text | Display name |
| Sender Type | enum | `client` or `garage` |
| Timestamp | datetime | Formatted: DD/MM/YYYY HH:MM (el-GR) |
| Read status | boolean | For unread count badges |

---

## 8. Data Entities & Field Reference

### 8.1 Client

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | auto | Format: `client-{timestamp}-{random}` |
| firstName | string | Yes | Defaults to "Επισκέπτης" for guests |
| lastName | string | No | |
| email | string | No | Lowercased |
| phoneNumber | string | No | |
| address | string | No | |
| isActive | boolean | auto | Default: true |
| isRegistered | boolean | auto | |
| createdAt | ISO string | auto | |
| updatedAt | ISO string | auto | |

### 8.2 Garage

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | auto | Format: `garage-{timestamp}-{random}` |
| companyName | string | Yes | |
| email | string | Yes | |
| mobile | string | Yes | Greek mobile format |
| address | string | Yes | |
| tin | string | Yes | 9 digits, unique |
| taxAuthority | string | Yes | e.g., "ΔΟΥ Αθηνών" |
| description | string | No | Default: "Εταιρεία εγγεγραμμένη στο NextService" |
| benefits | string[] | No | List of free services offered |
| isActive | boolean | auto | Default: false (requires approval) |
| createdAt | ISO string | auto | |
| updatedAt | ISO string | auto | |

### 8.3 Vehicle

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | auto | Format: `vehicle-{timestamp}-{random}` |
| clientId | string | Yes | Links to Client |
| brand | string | Yes | |
| model | string | Yes | |
| modelYear | string | No | 4 digits |
| engineCC | string | No | 100–9999 |
| fuelType | string | No | `petrol`, `diesel`, `electric`, `hybrid` |
| isAutomatic | boolean | No | Default: false |
| is4x4 | boolean | No | Default: false |
| isTurbo | boolean | No | Default: false |
| vinNumber | string | No | Max 17 chars, uppercase |
| engineNumber | string | No | |
| licensePlate | string | No | |
| color | string | No | |
| nickname | string | No | User-defined label |
| isActive | boolean | auto | Default: true |
| createdAt | ISO string | auto | |
| updatedAt | ISO string | auto | |

### 8.4 Service Request

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | auto | Format: `sr-{timestamp}-{random}` |
| clientId | string | Yes | Links to Client |
| vehicleId | string | Yes | Links to Vehicle |
| category | string | Yes | `service`, `fanopeia`, `oils`, `disk` |
| description | string | Yes | Free text |
| status | enum | auto | Default: `pending` |
| estimatedCost | number | No | Auto-calculated price estimate (€) |
| photoUrls | string[] | No | S3 URLs |
| photos | Photo[] | No | Detailed photo metadata (see below) |
| clientAvailabilityDates | string[] | No | Dates selected by client when accepting offer |
| acceptedOfferId | string | No | Set when client accepts an offer |
| appointmentDate | string | No | Confirmed appointment date (YYYY-MM-DD) |
| appointmentPrice | number | No | Confirmed appointment price (€) |
| createdAt | ISO string | auto | |
| updatedAt | ISO string | auto | |

**Photo metadata:**

| Field | Type |
|-------|------|
| id | string (photo-{timestamp}-{index}-{random}) |
| s3Url | string |
| s3Key | string |
| originalName | string |
| fileSize | number (bytes) |
| contentType | string (MIME) |
| description | string (e.g., "Damage photo 1") |
| uploadedAt | ISO string |

### 8.5 Offer

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | auto | |
| serviceRequestId | string | Yes | Links to ServiceRequest |
| garageId | string | Yes | Links to Garage |
| offerNumber | string | auto | Format: `Offer_DDMMYY_X` |
| estimatedCost | number | No | From the service request |
| offerAmount | number | Yes | Garage's proposed price (€) |
| status | enum | auto | Default: `PENDING` |
| benefits | string[] | No | Selected garage benefits for this offer |
| availabilityDates | string[] | Yes | Garage-proposed dates (YYYY-MM-DD, Mon–Fri, next 2 weeks) |
| clientAvailabilityDates | string[] | No | Client-selected dates when accepting |
| appointmentDate | string | No | Final confirmed date |
| appointmentPrice | number | No | Final confirmed price |
| createdAt | ISO string | auto | |
| updatedAt | ISO string | auto | |

### 8.6 Chat Message

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | auto | |
| requestId | string | Yes | Links to ServiceRequest |
| senderId | string | Yes | Client ID or Garage ID |
| senderType | enum | Yes | `client` or `garage` |
| senderName | string | Yes | Display name |
| message | string | Yes | Message content |
| garageId | string | No | For filtering conversations per garage |
| timestamp | ISO string | auto | |
| read | boolean | No | For unread tracking |

---

## 9. Status Definitions

### Service Request Statuses

| Status | Value | Greek Label | Badge Color | Meaning |
|--------|-------|-------------|-------------|---------|
| PENDING | `pending` | Εκκρεμές | Yellow | Request created, awaiting garage offers |
| IN_PROGRESS | `in-progress` | Σε Εξέλιξη | Blue | Service work has begun |
| APPOINTMENT | `appointment` | Ραντεβού | Blue | Client accepted offer, appointment scheduled |
| COMPLETED | `completed` | Ολοκληρωμένο | Green | Service work completed |
| CANCELLED | `cancelled` | Ακυρωμένο | Red | Request cancelled |

### Offer Statuses

| Status | Value | Greek Label | Badge Color | Meaning |
|--------|-------|-------------|-------------|---------|
| DRAFT | `draft` | Πρόχειρο | Gray | Not yet submitted |
| PENDING | `pending` | Εκκρεμές | Yellow | Submitted, awaiting client response |
| ACCEPTED | `accepted` | Αποδεκτή | Green | Client accepted this offer |
| REJECTED | `rejected` | Απορριφθείσα | Red | Client rejected or accepted another |
| EXPIRED | `expired` | Λήξασα | Gray | Offer expired |

---

## 10. Service Categories

| Key | Greek Name | Description | Has Photos Step | Base Price Estimate |
|-----|-----------|-------------|-----------------|---------------------|
| `service` | Σέρβις | Regular car maintenance/service | No (VIN + engine step) | ~€120 |
| `fanopeia` | Φανοποιεία | Body work, paint, damage repair | Yes (1–3 damage photos) | ~€80 |
| `oils` | Λάδια | Oil changes and fluid services | No (VIN + engine step) | ~€60 |
| `disk` | Δίσκος | Brake disc service | No (VIN + engine step) | ~€150 |

---

## 11. Car Brands & Models Reference

24 brands with dynamic model lists. Each brand has 13–21 models. Key examples:

| Brand | Example Models |
|-------|----------------|
| Toyota | Yaris, Corolla, Camry, Prius, RAV4, C-HR, Highlander, Land Cruiser, Hilux, Auris, Aygo, Supra |
| Volkswagen | Polo, Golf, Jetta, Passat, Arteon, Tiguan, Touareg, T-Cross, T-Roc, Beetle, Scirocco |
| BMW | Series 1–8, X1–X7, Z4, i3, i4, iX3 |
| Mercedes | A-Class through S-Class, GLA/GLB/GLC/GLE/GLS, G-Class, AMG GT, Sprinter |
| Audi | A1–A8, Q2–Q8, TT, R8, e-tron GT, RS3, RS4, RS6 |
| Hyundai | i10, i20, i30, Tucson, Kona, Santa Fe, Ioniq, Bayon |
| Ford | Fiesta, Focus, Mondeo, Puma, Kuga, Mustang, Ranger, Transit |
| Opel | Corsa, Astra, Insignia, Mokka, Crossland, Grandland |

All brands also have an "Άλλο" (Other) option for custom text entry. Same for models.

---

## 12. Price Estimation Logic

Automatic price estimation shown during service request creation.

**Base prices by category:** service €120, fanopeia €80, oils €60, disk €150.

**Adjustments:**
- Year ≥ 2020: +€30 | Year ≥ 2015: +€15 | Year < 2010: −€20
- CC ≥ 2000: +€25 | CC ≥ 1500: +€10 | CC < 1000: −€15
- Diesel: +€20
- Automatic: +€25
- 4x4: +€30

**Final range:** €80–€350. Popular brands (Toyota, VW, BMW, Mercedes, Audi, Ford) show "high confidence" with 15–40 similar cars. Others show "medium confidence" with 5–20 similar cars.

---

## 13. Header — Global Navigation

| User State | Left Content | Right Content |
|------------|-------------|---------------|
| Logged out | NextService logo | "Εγγραφή Επαγγελματία" + "Σύνδεση" (Login) |
| Client logged in | NextService logo | Profile link ({firstName}) + "Εγγραφή Επαγγελματία" + Logout |
| Garage logged in | NextService logo | Company name + Logout |

Mobile: Hamburger menu with same items.
