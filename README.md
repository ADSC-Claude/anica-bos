# ANICA Wellness Spa — Business Operating System

A single online system for a wellness spa in Quezon City: a public landing page with
online booking, and a secured staff portal covering Dashboard, Clients, Appointments,
Sales, Employees, Inventory, Finance, Marketing, Reports and Settings.

Built for a specific shape of business — **1 Owner, 1 Manager, 1 Receptionist, 9
therapists, open 12nn–12mn daily, Asia/Manila, ₱ PHP, currently Non-VAT on the 8%
income tax option** — and architected so a second branch is a Settings action rather
than a rebuild.

---

## Table of contents

- [Why this stack](#why-this-stack)
- [Quick start](#quick-start)
- [Default logins](#default-logins)
- [How the money works](#how-the-money-works)
- [Roles and what each one can do](#roles-and-what-each-one-can-do)
- [BIR CAS readiness](#bir-cas-readiness)
- [Configuration](#configuration)
- [Scheduled jobs](#scheduled-jobs)
- [Deployment](#deployment)
- [Backup and restore](#backup-and-restore)
- [Testing](#testing)
- [Project layout](#project-layout)
- [Acceptance criteria](#acceptance-criteria)
- [Known limits](#known-limits)

---

## Why this stack

| Choice | Reason |
|---|---|
| **Next.js 15 (App Router) + React 19 + TypeScript** | One deployable unit for the public site, the staff portal and the API. Server Components keep the phone bundle small — the Owner's dashboard ships ~106 kB of JS. Server Actions mean forms work without hand-written endpoints, and every mutation runs on the server where authorization actually lives. |
| **PostgreSQL + Prisma** | The data is relational and money must reconcile: receipts, journal lines, stock movements and payroll all need real foreign keys and transactions. Free tiers exist on Neon, Supabase and Railway, so hosting starts at ₱0. Prisma gives typed queries and a migration path. |
| **Session auth built in (JWT cookie + bcrypt)** | Three staff accounts do not justify a paid auth vendor, a monthly bill, or an outage that locks the front desk out. ~150 lines, no third party, no per-user pricing. |
| **Tailwind CSS 4** | Utility CSS with no runtime, so the reception tablet and a low-end Android phone both stay responsive. Big touch targets are enforced in one place (`globals.css`). |
| **PayMongo** | The standard Philippine gateway for small businesses: GCash, Maya, cards and online banking with no monthly fee. Falls back to a local simulated checkout when no keys are set, so the whole booking flow is demonstrable out of the box. |
| **Resend** | Transactional email with a free tier. Without an API key, emails are logged instead of sent — development never silently breaks. |
| **Money as integer centavos** | ₱1,234.50 is stored as `123450`. No floating-point drift anywhere: P&L, payroll and commission totals are exact and reproducible. |

Everything else is deliberately *not* a dependency: no ORM-on-top-of-ORM, no state
library, no component kit, no chart library. Fewer moving parts is the point — this has
to keep working for a small business for years.

---

## Quick start

Requirements: **Node 20+** and a **PostgreSQL 14+** database.

```bash
git clone <this repo> && cd anica-bos
npm install

cp .env.example .env
# Set DATABASE_URL, then generate a session secret:
#   openssl rand -base64 48
# and paste it into SESSION_SECRET.

npx prisma migrate deploy   # create the schema
npm run db:seed             # demo data: a week of reconciled history
npm run dev                 # http://localhost:3000
```

You now have:

- `http://localhost:3000` — the public landing page
- `http://localhost:3000/book` — online booking, working end to end in simulated
  gateway mode
- `http://localhost:3000/login` — the staff portal

`npm run db:reset` wipes and re-seeds at any time.

### What the seed creates

One branch (ANICA Quezon City), 3 user accounts, 9 therapists plus a manager and
receptionist, 14 services across 3 categories, 2 rooms + 6 beds + 1 sauna, 15
inventory items, 3 suppliers, 2 promos, a 10-session package and a 1-year membership,
20 clients with medical intake answers, and **a week of real operations**: attendance,
appointments, and ~70 receipts pushed through the actual checkout engine — so
commissions, loyalty points, stock movements and journal entries all reconcile against
each other on first run.

---

## Default logins

All three are forced to change their password on first sign-in.

| Role | Email | Password | Approval PIN |
|---|---|---|---|
| Owner | `owner@anicaspa.ph` | `anica-owner` | `2468` |
| Admin (Manager) | `manager@anicaspa.ph` | `anica-admin` | `1357` |
| Receptionist | `reception@anicaspa.ph` | `anica-front` | — |

The approval PIN authorizes voids, refunds and manual discounts above the configured
threshold at the POS.

> **Before going live:** sign in as each account, change the password, then change the
> approval PINs in Settings → Users. The defaults are printed on the login screen in
> development only.

---

## How the money works

One flow, zero re-entry. A completed appointment hands off to the POS with services
pre-loaded; a single `checkout()` call then does all of this in one transaction:

```
basket
  → gapless receipt number reserved from the branch's BIR series
  → discounts applied sequentially to the running total (each its own receipt line)
  → therapist commission on the UNDISCOUNTED list price
  → loyalty points earned / redeemed
  → prepaid sessions, gift certificates and vouchers decremented
  → inventory deducted (retail stock + service consumption recipes)
  → COGS computed
  → reservation deposit credited
  → balanced double-entry journal posted
```

Deliberate decisions worth knowing:

- **Commission is computed on the list price, never the discounted price.** A promo
  costs the business margin, not the therapist's pay. Free perks (the member birthday
  massage) and prepaid redemptions still credit commission at the base price.
- **Discounts stack by default**, applied one after another to the running total. PWD
  and Senior Citizen presets ship with stacking *off*, because Philippine law does not
  allow them to be combined — the POS refuses to apply them alongside anything else.
- **Tips are a liability, not income.** They are credited to `2300 Tips Payable` and
  shared out to the therapists on that receipt at payroll time, so they never inflate
  profit.
- **Inventory purchases are capitalised.** Receiving a purchase order debits
  `1200 Inventory` and shows up in cash flow immediately, but only reaches the P&L as
  COGS when the stock is actually consumed. Without this, buying a case of oil would
  be counted twice.
- **Nothing financial is ever deleted.** A void keeps the receipt number, reverses
  stock, loyalty, packages and gift certificates with explicit movements, and posts a
  *reversing* journal entry beside the original.

The arithmetic is pinned down by tests — see [Testing](#testing).

---

## Roles and what each one can do

Permissions live in one place (`src/lib/rbac.ts`) and are enforced **server-side on
every page and every endpoint**. The UI only hides what the server already refuses;
`tests/live/rbac-live.ts` proves it over real HTTP.

| | Owner | Admin (Manager) | Receptionist |
|---|:--:|:--:|:--:|
| Dashboard | full | full | no profit figures |
| Clients, Appointments, POS | ✓ | ✓ | ✓ |
| Approve voids / refunds / POs | ✓ | ✓ | — |
| Delete (void) financial records | ✓ | — | — |
| Finance, P&L, journals | ✓ | ✓ | submit expenses only |
| Payroll | ✓ | therapists only | — |
| Receptionist & Manager pay | ✓ | hidden | — |
| Incentives | ✓ | hidden | hidden |
| Reports | ✓ | ✓ | own daily summary |
| Settings | ✓ | most sections | — |
| User accounts, audit log, branches | ✓ | — | — |

Therapists do not log in. They are managed as employee records.

---

## BIR CAS readiness

This is a **record-keeping system, not an accredited BIR Computerized Accounting
System, and not a filing system**. It is built so accreditation later needs minimal
rework:

- **Immutable, gapless receipt series** per branch, configurable to your ATP range.
  Voided numbers are retained and never reused.
- **No hard deletes** on financial records. Corrections are void or adjustment entries
  carrying a reason, user and timestamp.
- **Real double-entry journals** from a small chart of accounts — sales, cash
  receipts, cash disbursements, general journal and a general ledger, all exportable
  to CSV, plus the daily EOD (z-reading style) report.
- **Configurable tax regime.** Default is Non-VAT with the 8% income tax option:
  receipts print without a VAT breakdown and carry the required *"not valid for claim
  of input tax"* notation, and gross sales are tracked against the ₱3,000,000 VAT
  threshold with a progress indicator on the P&L page. Every record already carries
  VATable / VAT-exempt / zero-rated / VAT-amount fields, so switching to
  VAT-registered reformats receipts and journals **without a migration**.
- **PWD and Senior Citizen ID numbers** are captured at checkout and printed on the
  receipt with a signature line, in either regime.
- **10-year retention**, with a documented backup and restore drill.

**Owner-controlled disclosure.** The system never transmits anything to the BIR or any
third party. Every export is produced only when a signed-in Owner or Manager asks for
it. Payroll, incentives, KPIs and client data are kept out of the BIR-format exports
entirely. Recorded sales always appear in full in the journals — the exports cannot
omit transactions, because that would defeat the integrity requirement accreditation
depends on.

---

## Configuration

Almost nothing is hard-coded. Settings has 16 sections; the ones people reach for:

| Section | Controls |
|---|---|
| Business profile | Name, address, hours, TIN, receipt footer, map embed |
| Service catalog | Services, prices, durations, commission rules, consumption recipes — the landing page updates instantly |
| Discount buttons | The POS preset row, stackable flags, ID requirements, the employee rate |
| Client intake form | The questions asked on the booking form **and** the CRM screen; existing answers are preserved when questions change |
| Online booking | Deposit %, expiry window, lead time, manual-transfer fallback, deposit forfeit policy |
| Payroll rules | Daily allowance, late/absence rules, holiday multipliers, holiday calendar |
| Tax & BIR | Regime, receipt notation, series |
| KPI targets | Monthly goals driving the green/amber/red scorecard |
| Permits | Compliance tracker with automatic renewal reminders |

Secrets stay in environment variables and never touch the database:

```bash
DATABASE_URL=            # Postgres, pooled (Supabase: port 6543)
DIRECT_URL=              # Postgres, direct — migrations only (Supabase: port 5432)
SESSION_SECRET=          # 32+ random chars — openssl rand -base64 48
NEXT_PUBLIC_APP_URL=     # public URL, used for gateway redirects and emails

PAYMONGO_SECRET_KEY=     # blank → simulated gateway (development only)
PAYMONGO_PUBLIC_KEY=
PAYMONGO_WEBHOOK_SECRET= # required to accept webhooks

RESEND_API_KEY=          # blank → emails are logged, not sent
EMAIL_FROM=

SEMAPHORE_API_KEY=       # optional PH SMS gateway
CRON_SECRET=             # protects POST /api/jobs/daily
```

### PayMongo webhook

Payment status is only ever trusted from a **signature-verified webhook** — never from
the browser. Register it once:

```bash
curl https://api.paymongo.com/v1/webhooks -u sk_test_xxx: \
  -H 'Content-Type: application/json' \
  -d '{"data":{"attributes":{
        "url":"https://YOUR_APP/api/webhooks/paymongo",
        "events":["checkout_session.payment.paid","payment.paid","payment.failed"]}}}'
```

Put the returned secret in `PAYMONGO_WEBHOOK_SECRET`. Requests without a valid
signature are rejected with 401, and replays older than five minutes are refused.

---

## Scheduled jobs

`POST /api/jobs/daily` (protected by `CRON_SECRET`) runs, idempotently:

1. Expire unpaid online bookings past their window
2. Send birthday greeting emails
3. Flag memberships expiring within the alert window and email renewal reminders
4. Raise low-stock alerts and clear resolved ones
5. Permit and certification renewal reminders (60 and 30 days out, then weekly)
6. Flag overdue corporate accounts
7. Flag clients overdue to return

On Vercel, add to `vercel.json` (already included):

```json
{ "crons": [{ "path": "/api/jobs/daily", "schedule": "0 22 * * *" }] }
```

`22:00 UTC` is 6am Manila. Elsewhere, use cron:

```bash
0 6 * * *  curl -fsS -X POST https://YOUR_APP/api/jobs/daily \
             -H "Authorization: Bearer $CRON_SECRET"
```

Or locally: `npm run jobs:daily`.

---

## Deployment

### Vercel + Supabase or Neon (recommended, free to start)

1. Create a Postgres database at [supabase.com](https://supabase.com) or
   [neon.tech](https://neon.tech). Copy **both** connection strings: the pooled one
   for `DATABASE_URL` and the direct one for `DIRECT_URL`.
2. Import the repo at [vercel.com](https://vercel.com).
3. Add the environment variables from [Configuration](#configuration).
4. Deploy. The build runs `prisma generate && next build`.
5. **The schema creates itself.** The build command is
   `prisma generate && prisma migrate deploy && next build`, so the first deploy
   applies `prisma/migrations/` to an empty database with no manual step.
   To load the demo data as well, run once from your machine:
   ```bash
   DATABASE_URL="postgres://…" DIRECT_URL="postgres://…" npm run db:seed
   ```
6. Register the PayMongo webhook against your deployed URL.
7. Sign in as each account and change the passwords and PINs.

Cost at this size: **₱0/month** until you outgrow the free tiers.

### Other hosts

Any Node host works — Railway, Render, Fly.io, or a VPS:

```bash
npm ci
npm run build   # generates the client, applies migrations, then builds
npm start       # listens on $PORT, default 3000
```

`npm run build:local` skips the migration step when you only want to compile.

Serve over HTTPS. Session cookies are `httpOnly`, `sameSite=lax` and `secure` in
production, and HSTS is set in `next.config.ts`.

---

## Backup and restore

Three layers, because losing a spa's books is not recoverable by apology.

**1 — Your database provider's snapshots.** Neon, Supabase and Railway all take
automatic daily backups with point-in-time restore. Turn this on; it is the fastest
path back from an accident.

**2 — Nightly independent dumps.**

```bash
npm run backup      # writes backups/anica-backup-<timestamp>.json
```

Schedule it and copy the output somewhere off the server:

```bash
0 2 * * *  cd /srv/anica && npm run backup && \
           rclone copy backups remote:anica-backups
```

**3 — The Owner's on-demand full export.** Settings → Backup & export →
*Download full backup*. This is the only export containing client health information,
so store it securely.

### Restoring

```bash
# 1. Point DATABASE_URL and DIRECT_URL at the target database (a fresh one, ideally).
npx prisma migrate deploy

# 2. Restore. Refuses to run if the target already holds sales,
#    unless you pass --force (which wipes it first).
npm run restore -- ./backups/anica-backup-2026-07-30T02-00-00-000Z.json

# 3. Verify the restored books reconcile.
npm run verify
```

Both the CLI dump and the Owner's browser download are accepted.

**Practise the restore.** A backup you have never restored is a hope, not a backup.
Restore into a scratch database once a quarter and confirm the row counts and the
current month's P&L match.

---

## Testing

```bash
npm run test        # unit + integration, against DATABASE_URL
npm run typecheck   # strict TypeScript across the whole project
npm run build       # production build
```

`npm run test` covers **21 tests**, including a full end-to-end pass against a real
database in an isolated branch that is cleaned up afterwards:

- money arithmetic in centavos, discount rounding, sequential discount stacking
- Manila date bucketing across the UTC boundary (a 23:30 sale belongs to that day)
- a paid sale updating commission, loyalty, inventory, COGS and finance in one call
- journal entries balancing, with tips as a liability and discounts as contra-income
- the P&L reconciling line by line
- a payslip with holiday double pay, shared tips, late deductions, a loan installment
  and contributions
- a void reversing stock, loyalty and journals while keeping the receipt number, and
  the next receipt continuing the sequence without gaps or reuse

`npm run verify` asserts ten database invariants that must hold for the books to be
trustworthy — journals balancing, receipt numbers unique and gapless per series,
commissions on the list price, no negative stock, no sale under-paid, no package
over-redeemed. Worth running after any restore.

Two live checks run against a running server (`npm run dev` in another terminal):

```bash
npx tsx tests/live/rbac-live.ts    # 33 authorization checks over real HTTP
npx tsx tests/live/pages-live.ts   # renders all 70 pages as each role
```

The RBAC check mints a genuine session cookie per role and confirms the **server**
returns 403 or redirects — not merely that a link is hidden.

CI (`.github/workflows/ci.yml`) runs the typecheck, tests, build, and then seeds a
throwaway Postgres and re-checks the invariants on every push and pull request.

---

## Project layout

```
prisma/schema.prisma        ~80 models; money as integer centavos; branch_id everywhere
prisma/seed.ts              demo data driven through the real checkout engine

src/lib/
  pos.ts                    the checkout engine — receipts, commissions, loyalty,
                            inventory, packages, journals, and void reversal
  payroll.ts                payslip drafting and finalisation
  accounting.ts             chart of accounts and balanced journal posting
  metrics.ts                dashboard, report and KPI aggregations
  availability.ts           attendance-driven therapist and room availability
  booking.ts                online booking, deposits, confirmation
  retention.ts              per-client return-threshold suggestions
  incentives.ts             Owner-only incentive computation
  jobs.ts                   the daily scheduled work
  rbac.ts                   the permission matrix
  guard.ts                  page and API guards, branch scoping
  audit.ts                  the append-only activity log

src/app/
  page.tsx                  public landing page
  book/                     booking wizard, confirmation, simulated gateway
  portal/                   the ten modules
  api/public/               catalog, availability, booking, proof upload
  api/webhooks/paymongo/    signature-verified payment webhook
  api/portal/export/        20 CSV report exports
  api/jobs/daily/           scheduled jobs endpoint

scripts/                    backup, restore, daily jobs, integrity verifier
tests/                      unit + integration; tests/live/ for HTTP checks
```

---

## Acceptance criteria

| Criterion | Status | Where |
|---|:--:|---|
| Visitor books online, pays the 30% fee via gateway, booking auto-confirms, client record auto-created, deposit credited at checkout, unpaid bookings expire | ✅ | `/book`, `src/lib/booking.ts`, `api/webhooks/paymongo` |
| Walk-in served and checked out (cash / GCash / bank transfer, incl. split) in under a minute with a printable receipt | ✅ | `/portal/sales/pos`, `src/components/receipt.tsx` |
| A paid sale updates commission, client history, loyalty, inventory and finance with no re-entry | ✅ | `src/lib/pos.ts`; test 1 |
| Receptionist cannot see P&L, payroll or Reports — server blocks direct API access too | ✅ | `src/lib/rbac.ts`; 33 live checks |
| Owner on a phone sees today's revenue, bookings and EOD from anywhere | ✅ | `/portal` mobile dashboard |
| EOD closing reconciles cash and locks the day | ✅ | `/portal/sales/eod` |
| Payroll produces a correct payslip: allowance from attendance (2× holidays) + commission + tips − late/absence − advances/loans/contributions | ✅ | `src/lib/payroll.ts`; test 4 |
| Low stock triggers an alert; receiving a PO updates stock and expenses | ✅ | `/portal/inventory`, `src/lib/jobs.ts` |
| P&L for a month with sample data is arithmetically correct | ✅ | `src/lib/metrics.ts`; test 3 |
| Voids/refunds require approval and appear in the audit log | ✅ | `voidSale()`; tests 5–6 |
| Installable PWA; today's schedule viewable offline | ✅ | `public/manifest.webmanifest`, `public/sw.js` |
| All Reports export to CSV | ✅ | 20 exports at `/portal/reports` |

---

## Known limits

Stated plainly, so nobody is surprised later.

- **Not a BIR-accredited CAS.** Built to be accreditable; accreditation itself is a
  separate application to the BIR. The UI says so wherever it matters.
- **No government or bank filing integrations.** Payroll and contributions are
  record-keeping only. SSS, PhilHealth, Pag-IBIG and BIR filing remain manual.
- **In-store payments are record-only.** The gateway is used solely for online booking
  deposits; cash, GCash and bank transfers at the counter are recorded, not processed.
- **Uploaded images are stored inline** (as data URLs) so no object store is needed.
  Deposit proofs are capped at 1.5 MB. If you start uploading many receipt photos,
  move `receiptUrl` and `depositProofUrl` to S3 or Cloudflare R2 — both are already
  plain URL fields.
- **Offline is read-only.** Today's schedule is cached; nothing is queued for later.
  This is deliberate: a queued sale that syncs twice, or not at all, is worse than a
  clear "you are offline" message.
- **SMS is opt-in and costs money.** Without a Semaphore key, the campaign helper
  generates a ready-to-paste message and recipient list instead.
- **`npm audit` reports three highs inside `next`'s own dependency tree**
  (`postcss`, `sharp`). Every current Next release is affected; the only "fix" npm
  offers is downgrading to Next 9, which would be far worse. Upgrade Next when
  patched upstream.

---

Built for ANICA Wellness Spa, Quezon City.
Timezone Asia/Manila · Currency PHP (₱) · Open 12nn–12mn daily.
