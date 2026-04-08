# Herd Ledger — CLAUDE.md

## Project Overview
Herd Ledger (herdledger.app) is a React/Vite + Supabase livestock management app for ranchers. Supports cattle, horses, sheep, goats, pigs, poultry and more. Tracks animals, gestation, pastures, expenses, sales, tasks, journal notes, and feeder programs. Wrapped with Capacitor for iOS and Android. Monetized via Stripe ($9.99/mo, $79.99/yr, 14-day trial).

## Tech Stack
- **Framework**: React 19 + Vite 7
- **Backend/Auth/DB**: Supabase (postgres + auth + storage + edge functions)
- **Styling**: Inline CSS-in-JS, CSS custom properties, no Tailwind, no TypeScript
- **Spreadsheet**: xlsx library
- **PDF**: jsPDF + jspdf-autotable
- **Mobile**: Capacitor (iOS + Android), bundle ID: app.herdledger.app
- **Payments**: Stripe (North Shore Ventures LLC)
- **Email**: Resend (via Supabase edge functions)

## Project Structure
```
src/
  App.jsx                     # Root: auth, nav, tab routing, ALL state, data persistence
  supabase.js                 # Supabase client
  lib/
    constants.js              # Enums, species data, CSS variables, default settings
    helpers.js                # Pure functions: isFemale, dueDate, getHealthStatus, etc.
    db.js                     # All Supabase read/write (loadAllData, persist*)
    dateUtils.js              # Shared date validation and formatting
    generateBillOfSale.js     # jsPDF Bill of Sale generator
  components/
    Animals.jsx               # Animal register, profiles, health, treatments, photos
    Gestation.jsx             # Breeding records, due dates, delivery
    Dashboard.jsx             # Summary cards, quick actions
    Pastures.jsx              # Pasture assignment, feed logging
    Expenses.jsx              # Expense tracking
    Sales.jsx                 # Load sales records
    Tasks.jsx                 # Task management
    Weaning.jsx               # Weaning tracker
    FeederProgram.jsx         # Feeder cattle program
    Settings.jsx              # Farm settings, tab visibility
    Auth.jsx                  # Supabase auth (login/signup/reset)
    BillOfSaleModal.jsx       # Bill of Sale modal (animal selection, buyer info, PDF preview)
    Account.jsx               # Billing/subscription page at /account
    Privacy.jsx               # Privacy policy page at /privacy
    Help.jsx                  # In-app help guide (8 sections)
    DateInputWithValidation.jsx  # Shared date input with validation
    ContactPicker.jsx         # Reusable contact selector
    ui.jsx                    # Shared UI primitives (Card, Btn, Input, Select, etc.)
supabase/
  functions/
    create-checkout-session/  # Stripe checkout (--no-verify-jwt)
    stripe-webhook/           # Stripe webhook handler
    send-welcome-email/       # Resend welcome email (DB webhook on auth.users insert)
    delete-account/           # Auth user deletion
    send-bill-of-sale/        # Resend BOS email with PDF attachment (--no-verify-jwt)
    get-portal-session/       # Stripe customer portal session (--no-verify-jwt)
android/                      # Capacitor Android platform
ios/                          # Capacitor iOS platform
capacitor.config.json         # Capacitor config (appId: app.herdledger.app)
vercel.json                   # SPA rewrites for /privacy and /account routes
```

## Database Tables (Supabase)
- `animals` — core columns + `extra_data jsonb` for all extra fields
- `gestations` — breeding records with due_date_start, due_date_end, sire_animal_id, running_with_bull
- `tasks`, `contacts`, `expenses`, `feeder_programs`, `load_sales`, `notes`, `pastures`, `pasture_feed_logs`
- `user_settings` — includes `farm_logo text` column
- `bill_of_sales` — generated BOS records (user_id, animal_ids, buyer info, sale details, pdf_url)
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
- **Offspring terms** — always use `getOffspringTerm(species)` from `constants.js`, never hardcode "calf" or "calves"

## Animal Archive Status (extra_data fields)
Animals are considered archived when any of these fields is set. **Never check `a.sale` alone — always use `a.sale && a.sale.dateSold`** to determine sold status. An empty `{}` object must not be treated as sold.

| Field | Shape | Meaning |
|---|---|---|
| `a.sale` | `{ dateSold, pricePerHead, buyerName, buyerContact, saleLocation, notes }` | Sold — check `a.sale && a.sale.dateSold` |
| `a.deceased` | `{ date, notes }` | Deceased |
| `a.butchered` | `{ date, notes }` | Butchered/harvested |
| `a.transfer` | `{ date, reason, recipient, notes }` | Given away / lost / escaped / transferred |

Transfer `reason` values: `Given Away`, `Lost`, `Escaped`, `Transferred to Another Farm`, `Other`.

Archive filter pattern (used in every status check):
```js
const isSold = a.sale && a.sale.dateSold;
const isArchived = isSold || a.butchered || a.deceased || a.transfer;
```

## Animal extra_data Notable Fields
- `photoUrl` — public URL in animal-photos bucket
- `tagColor` — hex string for tag badge; use `a.tagColor || "var(--brass2)"` as default
- `sale`, `deceased`, `butchered`, `transfer` — archive status objects (see above)
- `weights`, `treatments`, `vaccinations`, `documents`, `movements` — arrays

## Stripe / Billing
- **Entity**: North Shore Ventures LLC
- **Plans**: $9.99/month, $79.99/year — both include 14-day free trial
- **Hard limit**: 10 animals for free/trial users (enforced in App.jsx)
- **Grandfathered**: 24 users on legacy free access
- **Portal**: Stripe Customer Portal enabled — users manage/cancel via `get-portal-session` edge function
- **Secrets**: `STRIPE_SECRET_KEY`, `RESEND_API_KEY` set via `supabase secrets set`

## Capacitor (iOS / Android)
- After any web changes: `npm run build` then `npx cap sync android` (or `ios`)
- iOS requires Xcode on Mac (15.2+ for App Store submission)
- Android requires Android Studio; Google Play submission needs physical Android device for verification
- Config: `capacitor.config.json` — appId `app.herdledger.app`, webDir `dist`

## Client-Side Routes
Defined in `vercel.json` as SPA rewrites (all serve `index.html`):
- `/privacy` — Privacy policy (no auth required), rendered by `Privacy.jsx`
- `/account` — Billing/subscription page (auth required), rendered by `Account.jsx`

## Known Issues / Active Work
- Breeding record editing (#6) — not yet implemented (edit turn out/pull date/sire on existing records)
- Log Feed modal (#8) — currently scrolls to top, needs modal
- Account deletion (#13) — required for App Store, not yet built

## Bugs Fixed (reference)
- **Empty sale object** — `a.sale` can be `{}` from old data; always guard with `a.sale && a.sale.dateSold`
- **Vaccinations/health records** now log to journal automatically
- **Offspring terms** — species-specific names use `OFFSPRING_TERM_BY_SPECIES` from `constants.js`; never hardcode "calf"

## Upcoming Features (Priority Order)
1. Push notifications for task reminders (pg_cron + Resend)
2. Multi-user farm accounts
3. Bill of Sale viral loop — shareable link
4. Hobby farm monetization — lifetime plan, BOS as IAP
5. Google Play submission (need Android device for verification)
6. App Store submission (need Mac with Xcode 15.2+)

## Code Style Rules
- No TypeScript — plain .jsx/.js only
- Inline styles using CSS variables: `var(--green)`, `var(--brass)`, `var(--cream)`, `var(--ink)`, `var(--muted)`
- CSS class names prefixed with `hl-`
- Use existing ui.jsx primitives: `Card`, `Btn`, `Input`, `Select`, `Textarea`, `Badge`, `SectionTitle`
- Always use `DateInputWithValidation` for date inputs, never plain `Input type="date"`
- Always `sanitizeDate()` before persisting any date value
- Never use localStorage in new features — all persistence goes through `db.js`
- **Archive status**: check `a.sale && a.sale.dateSold` for sold, not just `a.sale`
- **Tag colors**: use `a.tagColor || "var(--brass2)"` for tag badge color
- **Offspring terms**: always use `getOffspringTerm(species)` from `constants.js`
- **Transfer status**: check `a.transfer` for given away/lost/escaped/transferred animals

## Dev Commands
```bash
npm run dev           # Start dev server
npm run build         # Production build
npm run preview       # Preview build
npx cap sync android  # Sync web build to Android (run after npm run build)
npx cap sync ios      # Sync web build to iOS (run after npm run build)
```

## Supabase Quick Reference
- Project URL: https://ugjtrdnqrlanrenhsddf.supabase.co
- Main test user: 80cd605b-afdf-4b5a-8801-44f20b0f638a
- RPC: `get_user_data(uuid)` — returns all tables in one call
- Old `user_data` table: keep until fully stable, then drop
- Edge function secrets: `STRIPE_SECRET_KEY`, `RESEND_API_KEY`
