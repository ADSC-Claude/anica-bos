# ANICA Stays — short-term rental PMS + direct booking website

One website, one booking engine, one master calendar, one guest database, one
operations system, one set of books.

Built for **1–3 units in Metro Manila and Bulacan**, ₱ PHP, Asia/Manila —
and architected so the fourth property in a fourth city is a row, not a
release. Same toolchain as the ANICA spa system in the parent directory, and
otherwise entirely separate from it: its own database, its own deployment, no
shared code or rows.

---

## Contents

- [Quick start](#quick-start)
- [The one thing worth reading](#the-one-thing-worth-reading)
- [What is built, and what is not](#what-is-built-and-what-is-not)
- [Default sign-ins](#default-sign-ins)
- [How the money works](#how-the-money-works)
- [Roles](#roles)
- [The automation chain](#the-automation-chain)
- [Airbnb sync](#airbnb-sync)
- [Configuration](#configuration)
- [Scheduled jobs](#scheduled-jobs)
- [Deployment](#deployment)
- [Backup and restore](#backup-and-restore)
- [Testing](#testing)
- [Project layout](#project-layout)
- [Design documents](#design-documents)

---

## Quick start

Requirements: **Node 20+** and **PostgreSQL 14+**.

```bash
cd rental
npm install

cp .env.example .env
# Set DATABASE_URL, then generate a session secret:
#   openssl rand -base64 48
# and paste it into SESSION_SECRET.

npx prisma migrate deploy   # creates the schema AND the exclusion constraint
npm run db:seed             # 3 properties, 8 accounts, 15 guests, 25 bookings
npm run dev                 # http://localhost:3000
```

You now have:

- `http://localhost:3000` — the public site
- `http://localhost:3000/book` — booking, working end to end in simulated gateway mode
- `http://localhost:3000/login` — the staff portal

`npm run db:reset` wipes and re-seeds. `npm run verify` checks that the data
reconciles with itself.

Only `DATABASE_URL` and `SESSION_SECRET` are required. Everything else degrades
to something usable: no PayMongo key runs a local simulated checkout, no Resend
key logs emails to the console, no Supabase key writes uploads to
`public/uploads`. A fresh clone exercises the whole book → pay → confirm →
clean → review chain with nothing but a database.

---

## The one thing worth reading

Every other decision here is negotiable. This one is not.

**Occupancy lives in exactly one table.** A reservation does not block dates by
existing — it blocks them by owning a row in `CalendarSpan`. Owner blocks,
cleaning blocks, maintenance blocks and imported Airbnb stays own rows in the
same table. So "these dates are taken" has a single definition, and Postgres
enforces it:

```sql
ALTER TABLE "CalendarSpan"
  ADD CONSTRAINT "CalendarSpan_no_overlap"
  EXCLUDE USING gist (
    "propertyId" WITH =,
    daterange("checkIn", "checkOut", '[)') WITH &&
  );
```

Three consequences:

- **A double booking is impossible**, not merely unlikely. The application never
  checks before writing; it writes and catches SQLSTATE `23P01`. A
  check-then-write races — two guests read "free" a millisecond apart and both
  write. A write-and-catch cannot, because the second `INSERT` blocks on the
  first one's index entry and then fails.
- **Same-day turnover still works.** `'[)'` is half-open, so 1–5 Aug and 5–9 Aug
  do not collide. A constraint that forbade that would cost a night a month to
  nobody.
- **Nights are `checkOut − checkIn`**, always, with no timezone in the
  arithmetic — stay dates are `@db.Date`, not instants.

`tests/booking-race.test.ts` fires eight concurrent bookings at the same dates
and asserts exactly one survives, that the other seven fail with a 409 the guest
can act on, and that no rolled-back attempt leaves a reservation behind.

---

## What is built, and what is not

What follows is the honest state; nothing below is aspirational.

### Working end to end

| | |
|---|---|
| **Design artifacts** | All ten in [`docs/`](./docs) — architecture, sitemap, permission matrix, ERD, workflows, automation map, wireframes, integrations, security & backup, function classification |
| **Data model** | Every entity in the brief; multi-property and multi-branch from the first row |
| **Double-booking prevention** | Database-enforced, race-tested |
| **Auth** | Sessions, lockout, forced password change, immediate revocation |
| **Authorization** | 7 roles, two gates (permission + property/assignee scope), one source of truth |
| **Public site** | Landing with above-the-fold search, all-stays, property pages with live availability, JSON-LD + OpenGraph |
| **Booking engine** | 4-step flow, server-side pricing, add-ons, promo codes, PayMongo checkout, deposit/balance, hold expiry |
| **Payments** | Webhook-confirmed (signature-verified, replay-rejected, idempotent), refunds through the gateway, security deposits |
| **Reservations** | Full lifecycle for every source, reschedule with rollback, cancel-and-release |
| **Guest CRM** | List with duplicate detection, profile with stays and notes, merge tool, consent, tier and totals derived from stays |
| **Guest self-service** | `/manage/[reference]` — the stay, the balance with a live pay link, the digital pre-arrival form, and access details once check-in releases them |
| **Messaging** | 8-message sequence, scheduled on confirmation, drained by cron, editable templates with a placeholder reference, per-reservation timeline |
| **Turnover** | Checkout → cleaning task with the next arrival as its deadline → mobile checklist with required photos → inspection → READY gate, plus the manager's board over the top |
| **Task board** | One board, one spine, phone layout for field roles |
| **Maintenance** | Report, assign, progress, complete. An urgent ticket can take dates off sale through the same constraint as a booking; completing one with a cost writes the expense |
| **Incidents** | Damage, complaints and safety, linked to the stay, the guest and the deposit |
| **Inventory** | Stock as the running sum of its ledger, purchases that book the cost, recounts as adjustments, linen across six states |
| **Airbnb iCal** | Import (polled, reconciled, conflict-reporting) and export (hand-written RFC 5545) |
| **Money & insight** | ADR / occupancy / RevPAR with formulas on screen, P&L per property and consolidated, expense entry with a receipt photo, owner dashboard, notifications panel |
| **Reports** | Eleven reports over one builder, so the screen and the CSV are the same query; export is a second permission from viewing; print stylesheet for PDF |
| **Reviews** | Submission at `/review/[token]`, the moderation screen, responses, recurring themes, and reviews recorded from other platforms |
| **Marketing** | Promotions with audience and window rules, consent-gated audience counts, lapsed-guest detection |
| **Documents** | Permits and contracts with expiry, private storage, and the reminder chain behind them |
| **Administration** | Property editor with photos and per-date pricing, settings without a deploy, message templates, people and their scope |
| **Jobs** | Two idempotent cron endpoints covering messages, holds, sync, alerts, document expiry, no-show and completion sweeps |
| **Operational safety** | Append-only audit log, integrity verifier, portable backup and restore |

### Not built yet

- **Campaign sending.** The audience, the consent gate and the `Campaign`
  tables are in place and the marketing screen reports on them; composing and
  sending a campaign is not wired up.
- **Laundry batches.** Linen moves between states and the ledger records it, but
  the batch-out / batch-back screen and its cost-to-expense step are not built.
- **Amenity and FAQ editing.** Both are seeded and both render on the public
  site; there is no screen to change them.
- **PWA service worker** for offline-tolerant checklists. Saving per item
  already limits the damage a bad signal does; surviving no signal at all does
  not.

Nothing from §12 of the brief (channel manager, smart locks, SMS, WhatsApp,
accounting export, multiple owners, long-stay billing, dynamic pricing) is
built — by design. The schema does not block any of them; see
[docs/10](./docs/10-function-classification.md).

---

## Default sign-ins

The seed creates one account per role and prints them when it runs. All eight
share a password that the seed prints, and every one is created with
`mustChangePassword`, so the first sign-in cannot reach anything until it is
changed.

| Email | Role |
|---|---|
| `owner@anicastays.ph` | Owner |
| `manager@anicastays.ph` | Property manager |
| `desk@anicastays.ph` | Reservations |
| `books@anicastays.ph` | Accountant |
| `ana@anicastays.ph` · `rosa@anicastays.ph` | Cleaners |
| `inspect@anicastays.ph` | Inspector |
| `fix@anicastays.ph` | Maintenance |

The login screen lists them in development and never in production.

> **Before going live:** change every password, rotate `SESSION_SECRET`, switch
> PayMongo to live keys, and change the seeded Wi-Fi passwords and door codes.
> The full list is in [docs/09](./docs/09-security-and-backup.md#pre-launch-checklist).

---

## How the money works

**Every peso is an integer number of centavos.** ₱3,500.50 is `350050`. No
float goes near a price, so ADR, RevPAR and the P&L reconcile exactly.

A booking is priced **server-side, every time**:

```
nightly rate × nights        (per-date overrides, then weekend rate, then base)
+ cleaning fee
+ extra-guest fee × guests beyond the threshold × nights
+ add-ons                    (per stay / night / guest / guest-night)
− discount                   (best auto-promo, or the code the guest typed)
= TOTAL
```

Whatever number the browser was showing is never consulted. The quote endpoint
and the booking endpoint call the same function, so they cannot drift.

Decisions worth knowing:

- **`totalCents` is stored, not recomputed.** It is what the guest agreed to; a
  later change to a cleaning fee must not rewrite a booking made last month.
- **`paidCents` is a cache of the payment rows**, rewritten in the same
  transaction as any payment. The balance is derived and never stored, because
  two stored numbers that must agree eventually disagree.
- **Refunds are negative payments**, not a separate table. One timeline per
  reservation, no special cases.
- **The webhook is the only thing that marks a payment paid.** The browser's
  return from PayMongo renders a "confirming" state and writes nothing.
- **ADR is accommodation only.** Cleaning fees and add-ons are revenue, but they
  are not a room rate; folding them in inflates ADR until it cannot be compared
  with last month.
- **Revenue is earned, not received.** A deposit taken in June for an August
  stay is August's revenue. Mixing the two shows a wonderful month followed by
  an empty one, for a business that was steady throughout.
- **A business-wide expense** (marketing, the accountant) lands in the
  consolidated P&L and on no single property's statement.

---

## Roles

Seven, enforced **server-side on every page and endpoint**, in one file
(`src/lib/rbac.ts`). The UI only ever hides what the server already refuses.

| | Owner | Manager | Reservations | Accountant | Cleaner | Inspector | Maintenance |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Dashboard | ✓ | ✓ | no money | ✓ | — | — | — |
| Calendar, bookings | ✓ | ✓ | ✓ | read | — | — | — |
| Guests | ✓ | ✓ | ✓ | — | — | — | — |
| Tasks | ✓ | ✓ | — | read | own | own | own |
| Operations | ✓ | ✓ | — | read | — | — | own |
| Finance, reports | ✓ | ✓ | — | ✓ | — | — | — |
| Settings | ✓ | most | — | — | — | — | — |
| Users, branches, audit | ✓ | — | — | — | — | — | — |

**Two gates, not one.** A permission answers *what kind of thing may you do*; it
does not answer *whose record is it*. A cleaner holds `tasks.complete` — that is
not permission to complete anyone's task. The scope gate
(`visibleProperties`, `scopeToAssignee`) narrows it, and skipping it is the
classic multi-tenant hole, so it lives in one helper every query passes through.

A cleaner signing in on a phone lands on `/portal/tasks`, filtered to them: one
column, no sidebar, no prices, no guest surnames. Full matrix and the reasoning
behind the awkward cells: [docs/03](./docs/03-roles-and-permissions.md).

---

## The automation chain

Every arrow is code, not a person copying data:

```
guest books → span held (atomically) → guest profile created or matched
  → payment webhook → CONFIRMED → 8 messages scheduled → arrival task
  → check-in → access code issued, pre-arrival messages cancelled
  → check-out → cleaning task created, deadline = next arrival, unit off READY
  → checklist + required photos → restock deducts stock
  → inspection passes → unit back to READY
  → review request → revenue reaches the dashboard
```

The only human steps are the two check marks, the cleaning itself, and the
inspection verdict — exactly the things a person has to physically observe.
Trigger-by-trigger: [docs/06](./docs/06-automation-map.md).

---

## Airbnb sync

iCal, which is what Airbnb offers without a partnership. It carries dates, not
money and not guest details, so we treat it as a **block feed**.

- **Export** — `GET /api/ical/[token].ics`, one unguessable token per property,
  every span that holds dates. Summaries carry **no guest names**: a feed is a
  URL, and a URL leaks. Written by hand against RFC 5545 (folding, CRLF, whole-day
  values) rather than pulled from npm, because this is a file we hand to a third
  party.
- **Import** — polled every 15 minutes. Reconciliation runs on `lastSeenAt`:
  every event a poll sees is stamped, and anything left unstamped was cancelled
  on the other side, so its dates go back on sale.
- **Conflicts are reported, never resolved silently.** An Airbnb stay that
  collides with a direct booking raises `SYNC_CONFLICT` naming both and leaves
  the decision to a person. Quietly dropping either one is worse.
- Each feed shows its last sync and raises an alert after two consecutive
  failures — a sync that quietly stopped a week ago is how a unit gets sold
  twice.

The whole layer sits behind a `ChannelSync` interface, so a real channel manager
is a second implementation and not a migration.

---

## Configuration

Everything a person can change without a deploy lives in `Setting` and is edited
in the portal: site copy, contact details, deposit percentage, hold window,
balance-reminder lead time, cancellation policy, guest tier thresholds, turnover
deadlines, KPI targets, message templates and checklists.

Environment variables are in [`.env.example`](./.env.example), each documented
with what happens when it is absent.

---

## Scheduled jobs

| Endpoint | Cadence | Does |
|---|---|---|
| `POST /api/jobs/minute` | every 15 min | sends due messages, expires unpaid holds, polls Airbnb, refreshes ready states |
| `POST /api/jobs/daily` | 06:00 Manila | arrivals, unready units, overdue cleans, emergencies, balances, low stock, document expiry, no-show and completion sweeps |

Both take `Authorization: Bearer $CRON_SECRET`, and both are **idempotent** —
running either twice in a day changes nothing, which is what makes a retry safe
and a manual `curl` harmless. Vercel Cron drives them in production;
`npm run jobs:minute` / `npm run jobs:daily` drive them locally.

---

## Deployment

Deploy as its **own Vercel project**, separate from the spa:

1. New Project → this repository → **Root Directory: `rental`**
2. Environment variables: `DATABASE_URL` (pooled, 6543), `DIRECT_URL` (direct,
   5432), `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, and the
   optional PayMongo / Resend / Supabase Storage keys
3. Deploy. `scripts/build.mjs` refuses to build with a missing secret, a
   malformed database URL, or a pooled connection with no direct URL — each of
   those otherwise surfaces as "a server-side exception has occurred" on a live
   page, which is the worst possible place to discover it.
4. PayMongo dashboard → webhook → `https://<your-domain>/api/webhooks/paymongo`,
   events `checkout_session.payment.paid`, `payment.paid`, `payment.failed`,
   `payment.refunded`. Paste the `whsk_…` secret into `PAYMONGO_WEBHOOK_SECRET`.
5. Airbnb → each listing → Availability → Sync calendars → paste
   `https://<your-domain>/api/ical/<token>.ics`, and paste Airbnb's feed URL back
   into Settings → Sync.

Migrations run from `DIRECT_URL`: a transaction pooler multiplexes away the
prepared statements and the advisory lock Prisma needs.

---

## Backup and restore

Three layers, because a backup you have not restored is a rumour.

1. **Supabase PITR** — continuous, saves you from `DELETE` without a `WHERE`.
2. **`npm run backup`** — a portable JSON snapshot of every table. Restores into
   any Postgres, which matters if Supabase is one day not the host.
3. **A copy the owner keeps off the platform.** Survives an account lockout, a
   billing lapse, or a vendor decision nobody consulted us about.

```bash
npx prisma migrate deploy
npm run restore -- backups/2026-08-07.json
npm run verify          # spans do not overlap · paidCents matches its payments
                        # · every breakdown sums to its total · stock matches
                        # its ledger · nothing claims READY with work open
```

`npm run verify` runs in CI on the seeded dataset, so the check that proves a
restore worked is exercised continuously rather than written once and trusted.
Restore refuses to run over a database that already holds reservations unless
you pass `--force`. Full procedure and RPO/RTO table:
[docs/09](./docs/09-security-and-backup.md).

---

## Testing

```bash
npm test          # needs DATABASE_URL; creates and cleans up its own fixtures
npm run typecheck
npm run verify

# and, against a running instance on the seeded database:
npm start &
npm run test:live
```

| File | Proves |
|---|---|
| `booking-race.test.ts` | 8 concurrent bookings → exactly 1 survives; same-day turnover allowed; cancelling releases dates immediately |
| `metrics.test.ts` | centavo arithmetic, half-open nights, date round-trips, and ADR / occupancy / RevPAR / P&L hand-checked |
| `ical.test.ts` | Airbnb feeds including folded lines, CRLF, datetime DTSTART, and malformed events dropped rather than guessed |
| `rbac.test.ts` | the permission matrix in [docs/03](./docs/03-roles-and-permissions.md), cell by cell |
| `live/rbac-live.ts` | the same matrix **over HTTP** — 127 checks that a forbidden page is refused by the server, not merely hidden by the UI |

The last one is the distinction worth having a test for. `can()` returning
`false` and the server actually refusing are two different claims, and only the
second one keeps anybody out.

---

## Project layout

```
rental/
├── docs/            the ten design artifacts — read 04 first
├── prisma/
│   ├── schema.prisma
│   ├── migrations/  including the exclusion constraint
│   └── seed.ts
├── scripts/         build · backup · restore · verify · run-jobs
├── src/
│   ├── app/         public site, portal, API, webhooks, cron
│   ├── components/  the small shared UI kit
│   └── lib/         the domain — see the dependency map in docs/01
└── tests/
```

`src/lib` is where the decisions live, and each module carries the reasoning for
its awkward parts:

| | |
|---|---|
| `calendar.ts` | the only writer of occupancy |
| `pricing.ts` | the only price that counts |
| `reservations.ts` | the lifecycle, and what holds dates |
| `payments.ts` | the webhook is the only truth |
| `operations.ts` | the task spine, the turnover, the READY gate |
| `messaging.ts` | the queue that is also the log |
| `sync/ical.ts` | the seam a channel manager will slot into |
| `metrics.ts` · `finance.ts` | the arithmetic an owner will hand-check |
| `rbac.ts` · `guard.ts` | the two gates |

---

## Design documents

Written before the code, and kept true to it. If a document and the code
disagree, the document is the bug.

| # | | |
|---|---|---|
| 1 | [Architecture](./docs/01-architecture.md) | what runs where, and which module may call which |
| 2 | [Sitemap](./docs/02-sitemap.md) | every public and portal route |
| 3 | [Roles and permissions](./docs/03-roles-and-permissions.md) | who may do what, and where it is enforced |
| 4 | [Data model](./docs/04-data-model.md) | every table, and why double booking is impossible |
| 5 | [Workflows](./docs/05-workflows.md) | reservation, guest journey, payment, turnover, maintenance |
| 6 | [Automation map](./docs/06-automation-map.md) | trigger → action → recipient |
| 7 | [Wireframes](./docs/07-wireframes.md) | landing, property, booking, dashboard, cleaner's phone |
| 8 | [Integrations](./docs/08-integrations.md) | PayMongo, email, iCal now; the rest later |
| 9 | [Security and backup](./docs/09-security-and-backup.md) | threat model, privacy, restore procedure |
| 10 | [Function classification](./docs/10-function-classification.md) | Native / Integrated / Automated / Future Phase |
