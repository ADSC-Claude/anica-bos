# Invited — digital invitations for Filipino celebrations

A mobile-first platform where customers in the Philippines buy a templated
**digital invitation** — a shareable link plus QR — for a wedding, debut,
christening, birthday or any of fourteen occasions, pay **once** in ₱ via
GCash / Maya / card / bank transfer, and either build it themselves or have
our team encode it (**Done-For-You**).

Four surfaces, one backend:

| Surface | Path | What it does |
|---|---|---|
| Public site | `/` | Landing page, template gallery, packages with a DIY / DFY toggle, comparison table, FAQ, live demo |
| Customer dashboard | `/account` | Checkout, builder with live phone preview, publish & share (QR, Messenger, Viber, WhatsApp, SMS), guest list with per-guest links, RSVP dashboard, seating, QR check-in, guestbook, DFY intake and revisions |
| Guest page | `/i/juan-and-maria` and `/i/juan-and-maria/<token>` | The invitation itself: no login, no app, works inside the Messenger and Viber browsers, one-tap RSVP, add-to-calendar, Maps & Waze, download as image, print / PDF |
| Admin | `/admin` | Orders & payments (PayMongo webhook + manual proof review), DFY kanban, templates, customers, invitations, coupons, support inbox, reports, settings (pricing editor, payment accounts, copy, staff, audit trail) |

Same toolchain as the ANICA spa and rental apps in this repository, and
otherwise entirely separate from them: its own database, its own Vercel
project, no shared code or rows.

---

## Contents

- [Quick start](#quick-start)
- [What the seed creates](#what-the-seed-creates)
- [How it works](#how-it-works)
- [Packages, tiers and gating](#packages-tiers-and-gating)
- [Occasions and sections](#occasions-and-sections)
- [Money and payments](#money-and-payments)
- [Done-For-You](#done-for-you)
- [Guest data and privacy](#guest-data-and-privacy)
- [Roles](#roles)
- [Configuration](#configuration)
- [Scheduled jobs](#scheduled-jobs)
- [Deployment](#deployment)
- [Testing](#testing)
- [Project layout](#project-layout)
- [Roadmap](#roadmap)

---

## Quick start

Requirements: **Node 20+** and **PostgreSQL 14+**.

```bash
cd invites
npm install

cp .env.example .env
# Set DATABASE_URL (and DIRECT_URL, the same value locally), then generate a
# session secret with `openssl rand -base64 48` and paste it into SESSION_SECRET.

npx prisma migrate deploy   # creates the schema
npm run db:seed             # catalogue + the "Juan & Maria" demo + a DFY job in progress
npm run dev                 # http://localhost:3000
```

You now have:

- `http://localhost:3000` — the landing page
- `http://localhost:3000/i/juan-and-maria` — the demo invitation
- `http://localhost:3000/checkout` — buy → pay (simulated gateway) → build → publish, end to end
- `http://localhost:3000/login` — sign in (the seed prints the accounts)
- `http://localhost:3000/admin` — the staff dashboard

Only `DATABASE_URL` and `SESSION_SECRET` are required. Everything else degrades
to something usable: no PayMongo key runs a local **simulated checkout** that
posts through the real webhook handler; no Resend key logs emails to the
console; no Supabase key writes uploads to `public/uploads`.

`npm run db:reset` wipes and re-seeds. `npm run verify` checks that the data
reconciles with itself.

## What the seed creates

- **Staff:** an Owner/Admin, an Encoder and a Support account. Their password
  is printed by the seed and each is forced to change it on first sign-in.
  Nothing is published here because this repository is public.
- **Customers:** Maria (owns the demo, plus a christening order waiting for
  proof-of-payment review) and Sofia (a Done-For-You debut mid-encoding).
- **Catalogue:** Basic / Standard / Complete packages for Wedding, Debut,
  Christening and Kids' Birthday, plus a generic fallback used by every other
  occasion; seven add-ons; three coupons (`LAUNCH20`, `REFER500`, one expired).
- **Templates:** five wedding designs (one premium), two debut, one each for
  christening, kids' birthday, milestone birthday, anniversary, corporate and
  memorial.
- **The demo, "Juan & Maria":** a Complete-tier wedding with parents (one
  marked *the late*), six pairs of principal sponsors, secondary sponsors,
  the full wedding party, dress code with four motif swatches, a gift note
  with a GCash QR, RSVP with meal choices and an adults-only policy, story
  timeline, gallery, program, FAQ, travel tips, hashtag, guestbook, eight
  guests with personal links across four tables, RSVPs and two weeks of
  page views.

## The shared album

A Complete-tier invitation can collect photos from its guests. The couple
switches it on in the builder under *Guest photos*, and the guest page grows a
wall and an upload form beneath it. Guests need no account; the form takes a
name, a photo and an optional caption.

Nothing a guest sends is served until it is approved — `loadPublic` only ever
loads approved rows, so a page cannot be defaced in the gap between an upload
and the couple noticing. Moderation lives at *Guest photos* on the invitation,
where each photo can be approved, hidden again, or deleted (which removes the
stored file too, not just the row).

The defences are the guestbook's, plus two the guestbook does not need: a photo
costs far more than a line of text, so uploads are capped at 12 per connection
per hour and 500 per invitation, and the file type is decided by its magic
bytes rather than the name the browser claimed.

## What it costs to serve a photo

Photos go out through Supabase's image transformation endpoint, not as the
file the phone uploaded. A phone photo is three or four megabytes and four
thousand pixels wide; the guest page shows it in a grid cell a couple of
hundred pixels across, and a Complete-tier album holds up to five hundred of
them. Served raw, one album opened by two hundred guests is hundreds of
gigabytes of egress — on its own enough to exhaust a month's allowance for
every app sharing the Supabase project.

`src/lib/images.ts` holds the sizes, one named entry per place a photo appears,
because transformations are billed per *origin* image rather than per
transformation: asking for six sizes of one photo costs the same as asking for
one. The endpoint negotiates WebP by itself, so the bytes fall again without
anything in the code naming a format.

Anything that is not a Supabase public object — the `public/uploads` fallback
in development, a pasted URL, a data URL, a signed private link — is passed
through untouched. The GCash QR is deliberately excluded too: a QR re-encoded
as lossy WebP is a QR that might not scan, and that image is how the couple
gets paid.

Image transformation is a paid Supabase feature and can be switched off in the
dashboard. `SUPABASE_IMAGE_TRANSFORM=off` matches that from this side, so a
project that loses the feature serves originals instead of broken images. Call
`imageUrl()` from server components only — that variable is not in the client
bundle, so a client component would keep rewriting after the switch was thrown.

## RSVP reminders by text

The guest list can text everyone who has not answered. Each guest gets their
own personal link, addressed with their salutation — *Ninong Fred & Ninang
Mila*, not *Fred Bautista*.

Sending is two steps, because a blast spends money on someone else's phone:
the first works out who would be texted, what the message will say and what it
costs, and only the second sends. Anyone texted in the last 24 hours is left
out, and every message sent is recorded, so a second blast an hour later cannot
double-charge for a reminder the guest has already read.

Cost is computed, not estimated. A plain message is one credit up to 160
characters; a single emoji forces the whole thing into UCS-2 and the allowance
collapses to 70, tripling the price of a blast. `creditsFor()` knows the
difference and the confirmation step shows it.

Without `SEMAPHORE_API_KEY` the messages are written to the server log and
recorded as `LOGGED`, so the whole chain can be exercised without an account
or a single spent credit.

## How it works

**DIY:** Landing → checkout (occasion → package → service mode → template →
add-ons → coupon) → pay → order `PENDING_PAYMENT → PAID → ACTIVE` → builder
unlocks → sections with a progress bar and tier-locked sections shown with an
*Upgrade* badge → live preview (phone / desktop) → publish → share.

**Done-For-You:** same checkout with DFY ticked → pay → a `DfyJob` is created
→ the customer fills the intake form (the same fields as the builder, in one
page), or says they will send it via Messenger / Viber / Excel → an encoder is
assigned, builds it in the same builder → moves the job to *Preview sent*
(customer gets a link by dashboard + email) → customer requests changes
(rounds are counted) or approves → staff publishes → the customer can still
edit afterwards.

Every write to an invitation goes through `src/lib/invitations.ts`; every
read of it by a guest goes through `loadPublic()`. Drafts are visible only to
their owner and staff, as a preview.

## Packages, tiers and gating

One table drives three things — the comparison table on the landing page, the
locks in the builder, and what the guest page renders: `src/lib/tiers.ts`
(features) and `src/lib/sections.ts` (`minTier` per section, with per-occasion
overrides such as an agenda being Basic for a corporate event). If they could
disagree, a customer would pay for a feature the guest never sees.

Prices are rows, not code (`Package`, `AddOn`), editable at
`/admin/settings/pricing`. A `Package` row with `occasion = null` is the
fallback for occasions without their own pricing. Orders snapshot the quote
at purchase; a later price change never moves money already agreed.

Service modes stack a fee on top of the package (`dfyFeeCents`,
`conciergeFeeCents`). The arithmetic lives in one place, `src/lib/pricing.ts`,
which is pure and unit-tested.

## Occasions and sections

`src/lib/sections.ts` is the single definition of what an invitation
contains. Each section is a list of typed fields (text, date, image, colours,
a *person* with title and a † marker, unbounded lists…). From that one
definition come:

- the builder's forms and the DFY intake form (`components/builder/fields.tsx`),
- server-side cleaning of whatever the browser sends (unknown keys dropped,
  strings capped, links checked, lists bounded — the 18 Roses stop at 18),
- the renderer (`components/invite/renderer.tsx`),
- the admin's read-only view of an intake.

Fourteen occasions each list their sections in order (`OCCASION_SECTIONS`).
Cover fields differ per occasion (bride & groom, a debutante, a child and
whether it is also a 1st birthday, a company and its logo, someone in
memoriam). Content is JSON on the `Invitation` row, so **switching templates
never loses data** — a template is only a layout variant, a palette and fonts.

Fixed labels on the guest page come from `src/lib/copy.ts` in English and
everyday Tagalog ("Mga Magulang", "Paki-confirm po ang inyong pagdalo bago
ang…"), switched per invitation. The default copy blocks (intro lines, gift
notes, adults-only, unplugged ceremony, RSVP note) have Tagalog variants too.

## Money and payments

All money is an integer number of **centavos**. `₱1,999.00 === 199900`.

Two ways in, one rule: **only the PayMongo webhook and an admin's
proof-of-payment review mark a payment paid.** The browser returning from the
gateway renders a "confirming" page and never writes status.

- **PayMongo Checkout Sessions** (GCash, Maya, cards, online banking, QR Ph).
  Sessions rather than Payment Intents so no card number ever reaches us. The
  webhook verifies the signature, is idempotent on the event id, and answers
  200 even on logic errors so PayMongo does not retry for hours.
- **Manual transfer:** the customer sees the GCash / Maya / bank details from
  Settings, uploads a screenshot (stored privately; staff see it through a
  one-hour signed link), and Support approves or rejects with a reason. The
  customer is notified either way.
- **Refunds** go through PayMongo for gateway payments and are recorded for
  manual ones; a full refund flips the order to `REFUNDED`.
- **Upgrades:** a customer on Basic buys Standard for the difference; when
  that order is paid the invitation's tier is raised in place.
- Unpaid orders are cancelled after 7 days (Settings).

## Done-For-You

`DfyJob` moves `NEW → INTAKE_RECEIVED → ENCODING → PREVIEW_SENT ⇄ REVISION →
APPROVED → PUBLISHED` on a kanban at `/admin/dfy`, with an SLA (`dueAt`, from
the turnaround in Settings), an assignee, internal notes, a revision counter
and a customer-facing thread. Overdue jobs are flagged red and nudge the queue
daily. Reports show average intake-to-preview and preview-to-publish hours.

## Guest data and privacy

- A guest's personal link is `/i/<slug>/<token>` where the token is 18
  random bytes. It resolves to that guest's name, reserved seats and table,
  and to nobody else's. Personal links are `noindex`; the general link is
  indexable only when the customer chooses *Public*.
- RSVP and guestbook writes are rate-limited per IP (counted in the database,
  no extra service), carry a honeypot field, and cap every string.
- Password-protected invitations set a cookie holding an HMAC of the
  invitation id and password hash, so changing the password signs every guest
  out and the cookie reveals nothing.
- Uploads are sniffed by magic bytes, never trusted by extension.
- The privacy page states the Data Privacy Act (RA 10173) commitments; deleting
  an invitation cascades to its guests, RSVPs and guestbook.

## Roles

| Role | Can |
|---|---|
| **Owner / Admin** | Everything, including pricing, staff accounts and the audit trail |
| **Encoder / Designer** | The DFY queue, the builder for any invitation, templates, customers (read), support replies. No money, no settings |
| **Support / Finance** | Orders, proof-of-payment review, refunds, customers, coupons, support inbox, reports, assigning DFY jobs. Does not encode or change prices |
| **Customer** | No permission at all — their authority is ownership, checked per record |

The matrix is `src/lib/rbac.ts`; `tests/rbac.test.ts` asserts it.

## Configuration

Everything in `.env.example`, with comments. Business details, contact
links (Messenger / Viber / WhatsApp), manual payment accounts, service
levels, policies and every email / SMS template are **Settings** rows edited
at `/admin/settings` with sane defaults in `src/lib/settings-defaults.ts`.

## Scheduled jobs

`POST /api/jobs/daily` (bearer `CRON_SECRET`; `vercel.json` schedules it at
06:00 Manila) expires links past their validity, warns a week before, cancels
stale unpaid orders, auto-closes Complete-tier RSVPs after the deadline, and
flags overdue DFY jobs. Idempotent. `npm run jobs:daily` runs it from a shell.

## Deployment

Two things: a Postgres database (Supabase, Neon, Railway…) and a Vercel
project whose **Root Directory is `invites`**. The build script refuses to
build from the wrong directory and prints what it can see (credentials
stripped) so a first deploy fails with a sentence rather than a stack trace.

1. **Database.** On Supabase, use the *transaction pooler* (port 6543) as
   `DATABASE_URL` and the *session pooler* (port 5432, same host) as
   `DIRECT_URL` — migrations cannot run over a transaction pooler.
2. **Storage.** Create two Supabase Storage buckets, `invites-public`
   (public) and `invites-private`, and set `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`. Without them uploads land on the container
   filesystem and do not survive.
3. **PayMongo.** Set `PAYMONGO_SECRET_KEY` (`sk_test_…` first). Create a
   webhook for `checkout_session.payment.paid`, `payment.paid` and
   `payment.failed` pointing at `https://<host>/api/webhooks/paymongo` and
   put its secret in `PAYMONGO_WEBHOOK_SECRET`. Test and live endpoints have
   different secrets.
4. **Email.** `RESEND_API_KEY` and a verified `EMAIL_FROM`.
5. **Vercel.** Region `sin1`. Set `NEXT_PUBLIC_APP_URL` to the final domain —
   it is baked into every share link and QR code. Set `CRON_SECRET`.
6. **Seed** the production database once, then sign in as the Owner, change
   the passwords, and replace the demo's placeholder photos and the sample
   testimonials on the landing page.

   Seeding runs from GitHub Actions — *Seed the invitations database*, under
   Actions — because it needs both the connection string and a real Node
   runtime: the seed is several hundred sequential statements, which is fast on
   a local socket and slow enough over the network to outlive a serverless
   timeout. It needs one repository secret, `INVITES_DIRECT_URL`, holding the
   Supabase **session pooler** string (port 5432; the seed uses prepared
   statements, which a transaction pooler multiplexes away).

   The workflow deletes every row in the target schema first, so it asks for a
   typed confirmation, shows which schema it is about to wipe, and refuses
   `public` outright — on a shared database that schema belongs to somebody
   else.

### Sharing a Supabase project with another app

The app does not need a Supabase project of its own. It runs happily in its
own **schema** on a project another app already uses. Set

```
DATABASE_SCHEMA=invites
```

and leave both connection strings exactly as Supabase gives them to you.
Prisma then creates and migrates that schema without touching `public`.

Set the schema *here* rather than appending `?schema=invites` to the URLs.
A connection string is a secret pasted into a dashboard, and Supabase's
pooled string already ends in a query string: appending `?schema=…` to it
produces a second `?`, which Postgres reads as part of the previous
parameter's value. The schema stays `public`, the migration runs against the
other app's tables, and the first you hear of it is `type "Role" already
exists` in a build log. `DATABASE_SCHEMA` overrides whatever the URL says, so
neither mistake can be made twice.

Keep the schema out of the Data API's *exposed schemas* list so PostgREST
cannot read it, and name the storage buckets `invites-public` and
`invites-private` so they do not collide with the other app's. The Vercel
project `anica-invites` is set up this way, on the `anica-bos-sg` project.

## The Data Privacy Act

The landing page and the privacy policy both promise a copy of your data on
request and deletion on request, so both exist rather than being an email
address to write to. *Your data*, in the customer dashboard, downloads
everything held about the account in one JSON file — the account, its orders,
every invitation, and the guest lists inside them — and deletes all of it after
the account holder types the confirmation phrase. Staff can carry out the same
erasure from a customer's page when the request arrives by email or Messenger,
recording where it came from; that goes in the audit log, marked sensitive.

Erasure is not `DELETE FROM "User"`. Invitations and everything hanging off
them go immediately and permanently — that is where somebody else's personal
data lives, a guest list being a hundred names and mobile numbers that were
never ours. The order and its payments stay, because a business must keep
records of what it sold for ten years, with every identifying field stripped
from them and from the account, which can no longer be signed into.

`npm run check:erasure` proves it against a real database: which rows survive a
transaction is not something a unit test can answer. It builds its own
throwaway customer, erases it, asserts on what is left, and cleans up after
itself even when it fails.

## Testing

```bash
npm run typecheck
npm test          # pricing, RBAC, section cleaning and gating, copy, CSV, QR, ICS, theme, dates
npm run verify    # the seeded data reconciles
npm run check:erasure   # the Data Privacy Act promises hold against a real database
```

CI (`.github/workflows/invites-ci.yml`) also builds, seeds, starts the server
and curls the landing page, the demo invitation, its calendar file and card
image, a 404, the admin redirect and the RSVP endpoint.

## Project layout

```
invites/
  prisma/           schema, migrations, seed
  scripts/          build guard, integrity check, jobs runner
  src/lib/          the domain: sections, tiers, pricing, copy, invitations,
                    orders, payments, guests, rsvp, dfy, reports, jobs,
                    plus auth, guard, rbac, db, storage, paymongo, email
  src/components/   invite renderer + client pieces, builder form engine,
                    landing page pieces, site chrome, shared UI
  src/app/          (public) /, /templates, /demo, /i/[slug], policies
                    /login, /signup, /checkout/*
                    /account/*  customer dashboard
                    /admin/*    staff dashboard
                    /api/*      public RSVP/guestbook, uploads, webhook, cron
  tests/            node:test suites (no database needed)
```

## Roadmap

Phase 1 and most of Phase 2 from the build brief are here. Not yet built:
Google / Facebook sign-in (email works everywhere including the Messenger
browser), custom domains, and the Save-the-Date mini-invite as a separate page
(it is currently a *card type* on the cover).
