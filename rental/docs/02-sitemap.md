# 2 — Sitemap

## Public site

No accounts. A guest is identified by a booking reference plus the email or
mobile they booked with.

| Route | What it is |
|---|---|
| `/` | Landing page. Hero, availability search above the fold, featured properties with from-price, direct-booking benefits, amenities, live promos, reviews, location, FAQ preview, contact, footer. |
| `/stays` | All active properties, filterable by dates, guests and branch. |
| `/stays/[slug]` | One property. Gallery, description, amenities, house rules, live availability calendar, rates, fees, promos, reviews, map, **Book now**. |
| `/book` | The booking engine. Four steps: dates & guests → property & price breakdown → guest details, add-ons, policies → pay. |
| `/book/pay/[reference]` | Hands off to PayMongo. Also the balance-payment page reached from the balance-due email. |
| `/book/simulate-payment` | Local stand-in for the gateway when `PAYMONGO_SECRET_KEY` is unset. Development only; refuses to render in production. |
| `/book/confirmation/[reference]` | Confirmation screen with the full breakdown and what happens next. |
| `/manage/[reference]` | Guest self-service: view booking, pay a balance, complete the pre-arrival check-in form, read access instructions once released. Gated by reference + email. |
| `/review/[token]` | One-time review form, from the review-request email. |
| `/unsubscribe/[token]` | Marketing opt-out. One click, no login, no confirmation step. |
| `/faq`, `/contact`, `/policies` | Editable from Settings — content, not code. |
| `/robots.txt`, `/sitemap.xml` | Generated from active properties. |

Every property page emits `schema.org/VacationRental` JSON-LD plus OpenGraph
tags, and renders as a Server Component so the HTML arrives complete.

## Staff portal

`/portal/*`. Every route is guarded server-side by a permission from
[document 3](./03-roles-and-permissions.md); the navigation only hides what the
server already refuses.

| Route | Permission | Notes |
|---|---|---|
| `/portal` | `dashboard.view` | Owner dashboard. Financial tiles need `dashboard.financials`. |
| `/portal/calendar` | `calendar.view` | Master calendar: month / week / day / per-property strip. |
| `/portal/reservations` | `reservations.view` | List, filter by property, source, status, date. |
| `/portal/reservations/new` | `reservations.edit` | Manual booking — phone, walk-in, corporate, OTA. |
| `/portal/reservations/[id]` | `reservations.view` | One reservation: money, messages, check-in, tasks, audit. |
| `/portal/guests` | `guests.view` | CRM list with New / Repeat / VIP badges. |
| `/portal/guests/[id]` | `guests.view` | Profile, stay history, spend, notes, incidents, reviews. |
| `/portal/guests/merge` | `guests.merge` | Duplicate finder and merge tool. |
| `/portal/tasks` | `tasks.view` | The task board. **Staff home screen** — cleaners and inspectors land here. |
| `/portal/tasks/[id]` | `tasks.view` | Mobile checklist, photo capture, inspection verdict. |
| `/portal/cleaning` | `cleaning.view` | Turnover schedule by day, unit-ready status. |
| `/portal/maintenance` | `maintenance.view` | Tickets, priorities, costs. |
| `/portal/incidents` | `incidents.view` | Damage and incident log. |
| `/portal/inventory` | `inventory.view` | Stock per property, low-stock, restock list, suppliers. |
| `/portal/inventory/linen` | `inventory.view` | Linen counts by state, laundry batches. |
| `/portal/finance` | `finance.view` | Income, expenses, P&L per property and consolidated. |
| `/portal/finance/expenses` | `finance.submitExpense` | Expense entry with receipt upload. |
| `/portal/reports` | `reports.view` | Every report in §7.3, each with a CSV export. |
| `/portal/reviews` | `reviews.view` | Reviews across platforms, ratings, responses. |
| `/portal/marketing` | `marketing.view` | Promotions, campaign helper, referrals. |
| `/portal/documents` | `documents.view` | Permits, contracts, insurance, expiry reminders. |
| `/portal/notifications` | `dashboard.view` | Full alert list; every row clicks through to its record. |
| `/portal/properties` | `properties.view` | Property list. |
| `/portal/properties/[id]` | `properties.edit` | All public content: photos, copy, rates, fees, amenities, rules, FAQs. |
| `/portal/settings` | `settings.view` | Index of the sections below. |
| `/portal/settings/site` | `settings.edit` | Landing-page text, contact, social, hero image. |
| `/portal/settings/booking` | `settings.edit` | Deposit %, hold window, cancellation policy, add-ons catalogue. |
| `/portal/settings/messages` | `settings.edit` | Message templates and their timings. |
| `/portal/settings/checklists` | `settings.edit` | Cleaning checklist templates per property. |
| `/portal/settings/people` | `settings.edit` | Staff and vendors directory. |
| `/portal/settings/users` | `users.manage` | Accounts, roles, property assignments, password resets. |
| `/portal/settings/branches` | `branches.manage` | Cities / areas. |
| `/portal/settings/sync` | `settings.edit` | Airbnb iCal feeds in and out, last-sync health. |
| `/portal/settings/audit` | `audit.view` | Audit log with before/after values. |
| `/portal/settings/backup` | `settings.critical` | Export everything; restore instructions. |
| `/portal/change-password` | session only | Forced on first sign-in. |

## API

| Route | Auth |
|---|---|
| `GET /api/public/availability` | none — public search |
| `POST /api/public/quote` | none — server-side pricing, the only price that counts |
| `POST /api/public/booking` | none — creates reservation + span in one transaction |
| `POST /api/public/checkin/[reference]` | reference + email |
| `POST /api/webhooks/paymongo` | HMAC signature |
| `GET /api/ical/[token].ics` | secret token in the path |
| `POST /api/jobs/minute`, `POST /api/jobs/daily` | `CRON_SECRET` bearer |
| `GET /api/portal/export/[report]` | session + `reports.view` |
| `POST /api/portal/upload` | session + per-module permission |

## Navigation, by role

What each role actually sees in the sidebar. A cleaner's portal is four items
and a phone-sized layout, not a shrunken owner dashboard.

| | Owner | Manager | Reservations | Accountant | Cleaner | Inspector | Maintenance |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Dashboard | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Calendar | ✓ | ✓ | ✓ | — | — | — | — |
| Reservations | ✓ | ✓ | ✓ | read | — | — | — |
| Guests | ✓ | ✓ | ✓ | — | — | — | — |
| Tasks | ✓ | ✓ | — | read | **✓** | **✓** | **✓** |
| Operations | ✓ | ✓ | — | read | — | — | — |
| Finance | ✓ | ✓ | — | ✓ | — | — | — |
| Reports | ✓ | ✓ | — | ✓ | — | — | — |
| Marketing | ✓ | ✓ | ✓ | — | — | — | — |
| Settings | ✓ | some | — | — | — | — | — |
