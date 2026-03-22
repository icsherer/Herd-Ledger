# Herd Ledger — CLAUDE.md

## Project Overview
Herd Ledger (herdledger.app) is a React/Vite + Supabase livestock management app for ranchers. Supports cattle, horses, sheep, goats, pigs, poultry and more. Tracks animals, gestation, pastures, expenses, sales, tasks, journal notes, and feeder programs.

## Tech Stack
- **Framework**: React 19 + Vite 7
- **Backend/Auth/DB**: Supabase (postgres + auth + storage)
- **Styling**: Inline CSS-in-JS, CSS custom properties, no Tailwind, no TypeScript
- **Spreadsheet**: xlsx library

## Project Structure
```
src/
  App.jsx               # Root: auth, nav, tab routing, ALL state, data persistence
  supabase.js           # Supabase client
  lib/
    constants.js        # Enums, species data, CSS variables, default settings
    helpers.js          # Pure functions: isFemale, dueDate, getHealthStatus, etc.
    db.js               # All Supabase read/write (loadAllData, persist*)
    dateUtils.js        # Shared date validation and formatting
  components/
    Animals.jsx         # Animal register, profiles, health, treatments, photos
    Gestation.jsx       # Breeding records, due dates, delivery
    Dashboard.jsx       # Summary cards, quick actions
    Pastures.jsx        # Pasture assignment, feed logging
    Expenses.jsx        # Expense tracking
    Sales.jsx           # Load sales records
    Tasks.jsx           # Task management
    Weaning.jsx         # Weaning tracker
    FeederProgram.jsx   # Feeder cattle program
    Settings.jsx        # Farm settings, tab visibility
    Auth.jsx            # Supabase auth (login/signup/reset)
    DateInputWithValidation.jsx  # Shared date input with validation
    ContactPicker.jsx   # Reusable contact selector
    ui.jsx              # Shared UI primitives (Card, Btn, Input, Select, etc.)
```

## Database Tables (Supabase)
- `animals` — core columns + `extra_data jsonb` for all extra fields
- `gestations` — breeding records with due_date_start, due_date_end, sire_animal_id, running_with_bull
- `tasks`, `contacts`, `expenses`, `feeder_programs`, `load_sales`, `notes`, `pastures`, `pasture_feed_logs`, `user_settings`
- `user_data` — legacy table kept for `offspring` key only, DO NOT DROP
- Storage bucket: `animal-photos` (public), `animal-documents` (public)

## Critical Architecture Rules
- **ALL app state lives in App.jsx** — passed as props to child tabs
- **Never store base64 photos in DB** — always upload to `animal-photos` Storage bucket, store URL as `extra_data.photoUrl`
- **persistAnimals strips `photo` field** from extra_data on every save — this is intentional to prevent timeouts
- **Guest mode** — full app works without login, data in localStorage key `herd_ledger_guest_data`
- **db.js loadAllData()** calls RPC `get_user_data(uuid)` for fast single-query load, falls back to 12 parallel queries
- **Date validation** — always use `sanitizeDate()` from `dateUtils.js` before saving any date field
- **Forms** — EditAnimalForm and RegisterAnimalForm are isolated components with their own state to prevent typing lag

## Known Issues / Active Work
- `dueDateEnd` bug: now fixed — persists to gestations table via due_date_start/due_date_end columns
- Breeding record editing (#6) — not yet implemented, edit turn out/pull date/sire on existing records
- Log Feed modal (#8) — currently scrolls to top, needs modal
- Account deletion (#13) — required for App Store, not yet built

## Upcoming Features (Priority Order)
1. Breeding record editing (#6)
2. Log Feed modal (#8)
3. Resend auth emails + welcome flow
4. Stripe paywall ($10-15/month, 30-day trial)
5. Account deletion (#13)
6. Flat sale entry (#9) — group sales not tied to individual animals
7. Hay/forage inventory (#10)
8. Page totals (#11) — sales by year, dynamic animal count
9. Task/due date reminders via Resend + pg_cron

## Code Style Rules
- No TypeScript — plain .jsx/.js only
- Inline styles using CSS variables: var(--green), var(--brass), var(--cream), var(--ink), var(--muted)
- CSS class names prefixed with `hl-`
- Use existing ui.jsx primitives: Card, Btn, Input, Select, Textarea, Badge, SectionTitle
- Always use DateInputWithValidation for date inputs, never plain Input type="date"
- Always sanitizeDate() before persisting any date value
- Never use localStorage in artifacts or new features — all persistence goes through db.js

## Dev Commands
```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview build
```

## Supabase Quick Reference
- Project URL: https://ugjtrdnqrlanrenhsddf.supabase.co
- Main test user: 80cd605b-afdf-4b5a-8801-44f20b0f638a
- RPC: get_user_data(uuid) — returns all tables in one call
- Old user_data table: keep until fully stable, then drop
