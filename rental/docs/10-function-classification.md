# 10 — Function classification

Every function in the brief, classified. The point of the table is that nobody
should have to read the code to find out whether something happens by itself.

| Class | Meaning |
|---|---|
| **Native** | Built here, in v1. Works with no external service. |
| **Integrated** | Built here in v1, but depends on an external service. |
| **Automated** | Runs without a person: inline in a transaction, or a background job. |
| **Future Phase** | Not built. The schema does not block it. |

A row can be two things: the guest message sequence is both Automated (a cron
drains it) and Integrated (Resend carries it).

## Public website and booking

| Function | Class | Notes |
|---|---|---|
| Landing page, SEO, JSON-LD, OpenGraph | Native | Content editable in Settings |
| Property pages, gallery, amenities, rules | Native | Every field admin-editable |
| Availability search | Native + Automated | Computed from spans on every request; never cached |
| Server-side pricing and quote | Native | The browser's number is never trusted |
| Promo codes and discounts | Native | Auto-apply and code entry |
| Add-ons at booking | Native | Catalogue in Settings |
| Booking creation | Native + Automated | Reservation + span in one transaction |
| **Double-booking prevention** | Native | Postgres `EXCLUDE USING gist` — not application logic |
| Payment (GCash, Maya, card, online banking) | **Integrated** | PayMongo Checkout Sessions |
| Down payment and balance link | Native + Integrated | Balance-due email carries a live payment link |
| Webhook confirmation | Integrated + Automated | Signed; the only thing that sets paid status |
| Hold expiry for abandoned payments | Automated | Cron every 15 min, window in Settings |
| Confirmation screen and email | Native + Integrated | Same content in both |
| Refunds | Integrated | Issued via PayMongo where possible, recorded either way |
| Security deposit hold / collect / return | Native | Record-keeping; linked to incidents |

## Reservations and calendar

| Function | Class | Notes |
|---|---|---|
| Master reservation table, all sources | Native | Direct, Airbnb, OTA, phone, walk-in, referral, corporate |
| Lifecycle statuses | Native + Automated | No-show and completion swept nightly |
| Master calendar: month / week / day / strip | Native | |
| Blocks: cleaning, maintenance, owner, unavailable | Native | Same constraint as reservations |
| Overlap rejection at write time | Native | Database-enforced, both reservations and blocks |
| **Airbnb iCal export** | Integrated | Secret per-property URL, RFC 5545 by hand |
| **Airbnb iCal import** | Integrated + Automated | Polled every 15 min, reconciled by `lastSeenAt` |
| Sync health and last-sync time | Native + Automated | Alerts after two consecutive failures |
| Channel manager (real-time OTA) | **Future Phase** | `ChannelSync` interface already in place |

## Guest experience

| Function | Class | Notes |
|---|---|---|
| Guest CRM, history, spend, preferences | Native | |
| Dedupe on email/mobile, merge tool | Native | Auto-dedupe at booking; merge is manual |
| New / Repeat / VIP badges | Native + Automated | Recomputed on every completed stay; thresholds in Settings |
| Message templates, editable | Native | `{{placeholders}}`, seeded defaults |
| **8-message guest sequence** | Automated + Integrated | Scheduled at confirmation, drained by cron |
| Copy-for-WhatsApp / Messenger | Native | Rendered body, one click to clipboard |
| Digital pre-arrival check-in form | Native | Companions, rules acknowledgement, arrival time |
| Check-in / checkout state changes | Native + Automated | Checkout fires the whole turnover chain |
| Access / key records | Native | Codes, activation, expiry, return — record-keeping in v1 |
| Reviews per platform + responses | Native | Direct, Airbnb, Google |
| Review request | Automated + Integrated | 1 day after checkout; direct link or Airbnb nudge |
| Retention, referrals, repeat-guest offers | Native + Automated | Lapsed-guest detection is a daily job |
| Campaign helper (filter → export or send) | Native + Integrated | Consent and unsubscribe enforced in the query |
| SMS gateway | **Future Phase** | `channel` column exists, dispatcher does not |
| WhatsApp automation | **Future Phase** | Same seam |
| Guest mobile app | **Future Phase** | The site is a PWA; an app is not planned |

## Operations

| Function | Class | Notes |
|---|---|---|
| **Cleaning task auto-created at checkout** | Automated | Deadline = next check-in |
| Priority from time-to-deadline | Automated | Urgent under 4h, high same-day |
| Mobile checklist per property | Native | Configurable templates |
| **Required photo verification** | Native | Cannot submit without the flagged photos |
| Restock quantities deduct stock | Automated | Writes an inventory movement per item |
| Inspection: pass / needs attention / failed | Native | Per area and overall |
| **READY gate** | Native + Automated | Not ready until inspection passes; dashboard flags it |
| Maintenance tickets, priorities, costs | Native | Emergency can block dates |
| Maintenance cost → expense | Automated | On completion |
| Task board, auto + manual | Native + Automated | Staff home screen |
| Incidents and damage log | Native | Links reservation, guest, deposit |
| Inventory ledger and low-stock alerts | Native + Automated | Beginning + purchases − usage |
| Suppliers and purchase history | Native | |
| Linen tracking by state | Native | Six states, movement ledger |
| Laundry batches and costs | Native + Automated | Batch cost becomes an expense |
| Staff and vendor directory | Native | Contacts, rates, assignments, performance notes |
| Offline-tolerant checklist | Native | PWA; ticks queue and flush |
| Smart-lock integration | **Future Phase** | `AccessRecord.method = SMART_LOCK` reserved |

## Money and management

| Function | Class | Notes |
|---|---|---|
| Income from reservations and payments | Automated | Split by accommodation / cleaning / add-ons / other |
| Expenses by property and category | Native | Receipt photo upload |
| **P&L per property and consolidated** | Native | Revenue − Expenses = Net Operating Profit |
| Owner dashboard: today / month / year | Native | |
| **ADR, Occupancy, RevPAR, ALOS** | Native | Formulas printed on the page |
| Booking-source mix | Native | |
| Branch / city filter and consolidated view | Native | Functional at 2 branches, unchanged at 20 |
| Notifications panel, click-through | Native + Automated | Dedupe keys, self-resolving |
| Reports, all date-filtered | Native | Daily ops, revenue, expenses, P&L, occupancy, sources, property comparison, cleaning, maintenance, inventory, guests, reviews |
| **CSV export on every report** | Native | Excel-safe: BOM, CRLF |
| Printable PDF | Native | Print stylesheet — no PDF dependency |
| Document management + storage | Integrated | Supabase Storage |
| **Expiry reminders 60 / 30 / weekly** | Automated + Integrated | Notification plus email to the Owner |
| Owner-controlled export | Native | Nothing leaves automatically |
| Accounting-software export | **Future Phase** | A report writer over existing tables |
| Multiple owners, per-owner statements | **Future Phase** | One nullable column on `Property` |
| Long-term-stay billing | **Future Phase** | |
| Dynamic pricing | **Future Phase** | Would write `RateOverride` rows |
| Additional payment gateways | **Future Phase** | `Payment.method` already an enum |

## Platform

| Function | Class | Notes |
|---|---|---|
| Auth, sessions, lockout, forced password change | Native | No auth vendor |
| 7 roles, permission matrix | Native | One file, server-enforced |
| Property and assignee scoping | Native | The second gate |
| Audit log with before/after | Native + Automated | Every mutation |
| Settings (site copy, policies, thresholds, templates) | Native | No deploy to change content |
| File storage | Integrated | Supabase Storage; local fallback in dev |
| Scheduled jobs | Automated | Vercel Cron, bearer-secret, idempotent |
| Backup: PITR | Integrated | Supabase |
| Backup: nightly logical export | Automated | GitHub Action, 30-day retention |
| Backup: owner-held copy | Native | Manual, monthly, by design |
| PWA / offline shell | Native | Matters for cleaners in stairwells |

## Counts

| Class | Count |
|---|---|
| Native | 58 |
| Integrated | 14 |
| Automated | 24 |
| Future Phase | 11 |

Rows are counted once per class they carry, so the totals overlap by design.
