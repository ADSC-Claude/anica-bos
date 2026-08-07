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
- [Data privacy (RA 10173)](#data-privacy-ra-10173)
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

The seed creates three accounts — Owner, Admin (Manager) and Receptionist. Their
credentials are **not published here**: this repository is public, and a live
deployment is one URL away from anyone reading it.

To find them, run the seed yourself (`npm run db:seed`) — it prints the three
sign-ins at the end. They are also listed on the login screen, which renders that
panel in development only and never in production.

All three accounts are created with `mustChangePassword`, so the first sign-in is
forced through `/portal/change-password` before anything else is reachable.

The **approval PIN** authorizes voids, refunds and manual discounts above the
configured threshold at the POS. Only the **Owner** holds one — a void erases a
sale and a manual discount gives money away, so the approval is the one control a
manager cannot exercise over their own shift. The PIN field appears only on Owner
accounts, and saving an account as Manager or Receptionist clears any PIN it held.
It is *not* covered by the forced password change, which makes it the credential
most likely to still be sitting at its seeded value.

> **Before going live, in this order:**
>
> 1. **Change the Owner's approval PIN** — Settings → User accounts → pick the
>    Owner → leave the password blank → enter a new PIN → Save. There is no
>    confirmation field, so sign out and test the new PIN on a void before
>    relying on it.
> 2. **Change every password.** Your own: the "Change my password" link in the
>    sidebar. Someone else's: Settings → User accounts → Reset password, which
>    forces them to set their own on next sign-in.
> 3. **Change the three email addresses** to ones your staff actually read — half
>    of a login is the username, and notifications go to these.

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

## Data privacy (RA 10173)

**The notice your clients read** lives at `/privacy`, linked from the landing-page
footer and from the consent tick box in the booking wizard — a notice you can only
reach after booking is written for the spa's benefit, not the client's. It is built
from live settings in `src/lib/privacy-notice.ts`, so the retention periods it quotes
are the ones the nightly job is actually enforcing. Name a contact for data requests
under Settings → Operations; until you do, it tells clients to write to "the owner".

**Where the data lives.** One PostgreSQL database, and nothing else. There is no
second store, no analytics warehouse, no third-party CRM holding a copy. Payment
proof screenshots are written into the appointment row as data URLs rather than to
an object store, so the database really is the whole of it.

**Which region.** The app runs in `sin1` (Singapore), set in `vercel.json`. Vercel
has no Philippines region, and Singapore is the closest one to Manila — roughly
2,400 km against Mumbai's 5,300, which is the difference between about 40 ms and
about 120 ms on every request. Put your database in the same region (Supabase and
Neon both offer `ap-southeast-1`): a Singapore app talking to a Mumbai database
crosses the Indian Ocean on every query, and co-locating them matters far more than
either choice alone. Processing still happens outside the Philippines, which RA 10173
permits — you remain accountable for it, and the notice at `/privacy` says so. If you
move either, update `privacy.hostingLocations` in Settings so the notice stays true.

**Who else sees anything.** PayMongo (card and e-wallet payments — checkout is
hosted on their side, so no card number ever reaches this system), Resend (email),
Semaphore (SMS, optional), plus your database host and Vercel. That is the complete
list, and the first three only receive what a booking needs.

**What the spa holds.** Identity (name, mobile, email, birthday, address, PWD and
Senior ID numbers), health answers from the intake form, two consent records with
their timestamps, visit and sales history, and — staff-side — sign-in attempts with
IP addresses and an append-only audit log.

**Two consents, not one.** RA 10173 wants consent specific to a purpose, and a
liability waiver is a different purpose from holding a health history. Each has its
own tick and its own timestamp. The wording lives in `src/lib/consent.ts` so it
cannot drift between the booking wizard and the desk.

**Health information is walled off.** Every CSV export deliberately omits it. The
only export that contains it is the Owner's full backup, which is always encrypted
and always writes a `sensitive` audit entry naming who downloaded it.

**Access is logged, not withheld.** Receptionists can see health records, because
the person taking the booking is the one who has to know about the allergy. The
protection is accountability instead: opening a health record writes an audit entry
against the person who opened it, deduped to one per client per day. See
`recordMedicalAccess` in `src/lib/medical.ts`.

**Erasure without breaking the books.** A client can ask to be forgotten, and
Settings → the client's *Edit details* tab → *Erase personal data* (Owner only)
carries it out: health answers, contact details, address, notes, consent, staff
notes about her and her deposit screenshots all go. Sales, receipts, journals and
appointment times stay, because BIR requires ten years of them and a receipt whose
customer row has vanished reads to an examiner as a concealed sale. The PWD or
Senior ID printed on a receipt stays for the same reason; the copy on the client
record is deleted. The erasure is audited **without naming her** — naming her would
write her straight back into an append-only table. See `src/lib/erasure.ts`.

**Logs age out.** Sign-in attempts (which carry IP addresses) and the email log are
pruned nightly on the windows set by `privacy.loginLogRetentionDays` and
`privacy.emailLogRetentionDays`. Set either to `0` to keep forever. The audit log is
deliberately never pruned: it is append-only, an examiner reads it, and it is where
the record of who opened whose health file lives.

**Still on you.** Naming a Data Protection Officer, and checking whether the spa
meets the National Privacy Commission's registration thresholds — broadly, sensitive
personal information on 1,000+ individuals. The notice at `/privacy` is written to be
accurate about this system, but it has not been reviewed by a lawyer and it cannot
know your circumstances; read it once against how the spa actually operates before
you rely on it.

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
   [neon.tech](https://neon.tech). On Supabase, **Connect** offers three strings
   and the choice matters:

   | String | Port | Goes in |
   | --- | --- | --- |
   | Transaction pooler | 6543 | `DATABASE_URL` — the app at runtime |
   | Session pooler | 5432 | `DIRECT_URL` — migrations and seeding |
   | Direct connection | 5432 | neither, on Vercel — see below |

   The direct host resolves over IPv6 only unless the IPv4 add-on is bought, and
   build runners generally have no IPv6 route. The session pooler is the same
   database over IPv4. Copy each string whole rather than editing one into the
   other: the pooler routes by project reference in the *username*, so a pooler
   host with the direct string's `postgres` username is rejected with the rather
   misleading "Tenant or user not found".
2. Import the repo at [vercel.com](https://vercel.com).
3. Add the environment variables from [Configuration](#configuration), ticking
   **Production** and **Preview** on each. A variable saved for Production only
   is invisible to preview builds, which then fail on the missing value.
4. Deploy. The build runs `scripts/build.mjs`, which validates both connection
   strings and prints them with the passwords stripped before touching the
   database — so a failed build says which variable is wrong and why.
5. **The schema creates itself.** `scripts/build.mjs` runs `prisma migrate
   deploy` before `next build`, so the first deploy applies
   `prisma/migrations/` to an empty database with no manual step.
6. Load the demo data — the schema arrives empty, including the login accounts.
   See [Seeding a hosted database](#seeding-a-hosted-database).
7. Register the PayMongo webhook against your deployed URL.
8. Sign in as each account and change the passwords and PINs.

### Seeding a hosted database

A fresh deploy has tables but no rows — no branch, no services, and nothing to
log in with. Either run the seed against the hosted database from your machine:

```bash
DATABASE_URL="<session pooler string>" npm run db:seed
```

or, with no local setup, use the **Seed database** workflow under the repository's
Actions tab. It needs one secret — Settings → Secrets and variables → Actions →
`DIRECT_URL`, holding the session pooler string — and asks for a typed
confirmation, because it deletes every existing row before seeding. Use the
session pooler for both: the seed relies on prepared statements, which a
transaction pooler multiplexes away.

Cost at this size: **₱0/month** until you outgrow the free tiers.

### Other hosts

Any Node host works — Railway, Render, Fly.io, or a VPS:

```bash
npm ci
npm run build   # generates the client, applies migrations, then builds
npm start       # listens on $PORT, default 3000
```

`npm run build` runs `scripts/build.mjs`, which checks the database environment
before doing anything and explains what is missing rather than failing with a
Prisma stack trace. It also defaults `DIRECT_URL` to `DATABASE_URL` when no
connection pooler is in play, and appends `?pgbouncer=true` to a Supabase pooler
URL — without which queries fail at runtime once connections start being reused.

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
BACKUP_PASSPHRASE="…" npm run backup   # backups/anica-backup-<timestamp>.json.enc
```

Set `BACKUP_PASSPHRASE` (12 characters minimum) and the dump is encrypted with
AES-256-GCM, the key stretched from the passphrase with scrypt. Leave it unset and
you get plain JSON containing every client health record in readable form — the
script warns loudly on every run rather than letting a nightly cron quietly pile up
readable files on a spare disk.

**Set it.** The consent your clients tick says their health details leave the spa
only inside an encrypted backup, and a nightly plaintext dump makes that sentence
untrue. The CLI still lets you run without one — refusing outright would turn a
mistyped variable into a spa with no backups at all, which is worse — but an
unencrypted dump is a deliberate choice you are making on your clients' behalf.

Schedule it and copy the output somewhere off the server:

```bash
0 2 * * *  cd /srv/anica && BACKUP_PASSPHRASE="…" npm run backup && \
           rclone copy backups remote:anica-backups
```

**Keep the passphrase somewhere that is not the backup drive.** There is no
recovery path: without it the file cannot be opened by anyone, including you.

**3 — The Owner's on-demand full export.** Settings → Backup & export →
*Download encrypted backup*. This is the only export containing client health
information, and it is always encrypted — it asks for a passphrase on the screen and
there is no way from there to produce a readable file. The consent your clients sign
says their health details leave the spa no other way.

### Restoring

```bash
# 1. Point DATABASE_URL at the target database (a fresh one, ideally). If it sits
#    behind a pooler, use the direct connection string here — DDL needs it.
npx prisma migrate deploy

# 2. Restore. Refuses to run if the target already holds sales,
#    unless you pass --force (which wipes it first).
BACKUP_PASSPHRASE="…" npm run restore -- ./backups/anica-backup-2026-07-30T02-00-00-000Z.json.enc

# 3. Verify the restored books reconcile.
npm run verify
```

Encrypted files are detected by their contents, not their extension, so a renamed
file still restores. The passphrase can also be given as `--passphrase=…`. A wrong
passphrase and an altered file both refuse — GCM authenticates as well as encrypts,
so a backup somebody has edited will not load silently into the books.

Both the CLI dump and the Owner's browser download are accepted, encrypted or not.

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
  consent.ts                the two things a client agrees to, in one place
  privacy-notice.ts         the RA 10173 notice, built from live settings
  medical.ts                therapist health alerts, and the access log behind them
  erasure.ts                RA 10173 erasure that leaves the books standing
  backup-crypto.ts          AES-256-GCM backup envelope (also used by scripts/)
  passphrase.ts             the passphrase rule, shared with the browser

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
