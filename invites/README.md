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
| Guest page | `/juan-and-maria` and `/juan-and-maria/<token>` | The invitation itself: no login, no app, works inside the Messenger and Viber browsers, one-tap RSVP, add-to-calendar, Maps & Waze, download as image, print / PDF |
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
- [Collections and openings](#collections-and-openings)
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
- `http://localhost:3000/juan-and-maria` — the demo invitation
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

- **Staff:** an Owner/Admin, an Encoder and a Support account. Against a local
  database they share a password the seed prints; anywhere else the seed
  refuses to run without `SEED_PASSWORD` and never prints what you gave it.
  That is because its built-in password is written in `prisma/seed.ts` in a
  public repository, on an account whose role is ADMIN — and being forced to
  change it on first sign-in protects nothing if a stranger signs in first.
- **Customers:** Maria (owns the demo, plus a christening order waiting for
  proof-of-payment review) and Sofia (a Done-For-You debut mid-encoding).
- **Catalogue:** Basic / Standard / Signature packages for Wedding, Debut,
  Christening and Kids' Birthday, plus a generic fallback used by every other
  occasion; seven add-ons; three coupons (`LAUNCH20`, `REFER500`, one expired).
- **Templates:** five wedding designs (one premium), two debut, one each for
  christening, kids' birthday, milestone birthday, anniversary, corporate and
  memorial.
- **The demo, "Juan & Maria":** a Signature-package wedding with parents (one
  marked *the late*), six pairs of principal sponsors, secondary sponsors,
  the full wedding party, dress code with four motif swatches, a gift note
  with a GCash QR, RSVP with meal choices and an adults-only policy, story
  timeline, gallery, program, FAQ, travel tips, hashtag, guestbook, eight
  guests with personal links across four tables, RSVPs and two weeks of
  page views.

## The shared album

A Signature-package invitation can collect photos from its guests. The couple
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
hundred pixels across, and a Signature-package album holds up to five hundred of
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

DIY is self-serve all the way through: nothing is handed to staff, no `DfyJob`
is created, the customer publishes it themselves, and the invitation never
closes to their changes. Marking a section *Done* folds it away and moves the
progress bar — it is their own bookkeeping, not a submission, and an
invitation can be published with sections still unmarked — `publishProblems()`
insists only on the cover's required fields and on finishing a colour motif
once one is started. `selfServe()` in
`src/lib/pricing.ts` is the one definition of which orders work this way: DIY,
and an invitation with no order behind it at all.

**Done-For-You:** same checkout with DFY ticked → pay → a `DfyJob` is created
→ the customer fills the intake form (the same fields as the builder, in one
page), or says they will send it via Messenger / Viber / Excel → an encoder is
assigned, builds it in the same builder → moves the job to *Preview sent*
(customer gets a link by dashboard + email) → customer requests changes
(rounds are counted) or approves → staff publishes → the customer can still
edit afterwards.

**The change window is a Done-For-You thing, not a platform thing.** On a
team-serviced invitation, three weeks before the event it closes to the
customer's changes so an encoder can make the final touches, which are due two
weeks before; `changeWindow()` in `src/lib/progress.ts` computes both dates and
`assertOpenForChanges()` enforces it on every customer write. Both take the
service mode, so a DIY invitation has no window to be locked out of: no date
closes it before the event. What still bounds a self-serve customer after they
publish is their package's revisions (2 / 4 / 6) and the design freezing at
publish — a count, not a deadline. Staff are never locked out either way.

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

## Collections and openings

A **collection** is a colour family that cuts across occasions — the way a
couple actually shops ("show me the white ones") rather than the way the
database is organised. `src/lib/collections.ts` declares them; a template
carries at most one in `Template.collection`. A collection with no published
design of its own is never shown and has no page, so the list can be written
ahead of the designs.

**Capiz** is the flagship, in the Filipiniana Collection at
`/collections/filipiniana`: capiz shell and bronze wax, opening with the seal.
It has its own `capiz` layout, whose shell border is drawn from the palette
rather than supplied as artwork, so the design recolours with the customer's
own accent instead of framing the page in a colour that no longer matches it.

**Baby Blue** is the christening design, in the Baby Blue Theme at
`/collections/babyblue`: sky and clouds with a dove and the church bell for
the cover, blue and cream organza for the rest. Its `babyblue` layout lays one
of the designer's ten grounds behind each page (`src/lib/design.ts` names
them; `PageGround` trims each to its page, keeps a taller page's head and foot
whole and stretches the band between, and brings a short page's foot in under
the words). Two grounds are drawn pages — Our Story with six polaroid frames
down a timeline, Baby Photos with four — whose frames take the client's
photographs and whose writings are set live where the designer set hers
(`src/lib/babyblue.ts` holds the measured slots), so staff and the client can
change them. The christening's story is told in six milestones, the design's
own to start.

An **opening** is the short moving scene before the invitation. The guest taps
once, it plays, and the invitation is underneath. `src/lib/openings.ts` is the
catalogue:

| Opening | Tier | What the guest sees |
| --- | --- | --- |
| The Envelope | Basic | A closed envelope, the monogram on the seal, the flap opening. |
| The Line | Standard | A gold curve drawing itself across warm white. |
| The Curtain | Standard | Two sheer curtains over the couple's photo, parting to the sides. |
| The Drape | Every package | Hanging silk with the names on it, lifted away. |
| The Seal | Every package | Wax pressed with the monogram; it lifts, the flap folds back, the card rises. |
| Photo Story | Every package | Three photos fanned like prints, sliding apart. |
| Cinematic | The premium opening add-on | The clip drawn for the design: the Capiz seal breaking, or the Baby Blue bow untying and its ribbons sweeping aside. |

**None of these is a video.** Every one is drawn by the browser from the
couple's own palette, words and photos — a `<div>`, a CSS transition and, for
The Line, one SVG path. That is not a stylistic preference:

- The names, date and line are live text, so a couple can change a nickname at
  11pm and the opening says the new one on the next reload. A rendered clip
  would have to be re-made per couple, per edit, by hand.
- It weighs nothing. A 4-second 1080p clip is 2–6 MB before it plays; this is
  a few kilobytes of markup already in the page. The product is a link opened
  on mobile data in a Messenger in-app browser, and the first screen is the
  one that decides whether the guest waits.
- It re-skins itself. The stage reads `--inv-accent`, `--inv-surface` and the
  rest, so an opening works on all twelve palettes without a second asset.
- Nothing goes through storage, so nothing is charged for egress.

That holds for the six drawn openings. **The cinematic one is the exception,
and it is deliberate.** Photoreal cloth — a silk bow untying, beadwork with
raised shadow — cannot be drawn in CSS or in Lottie, which is vector. It is
artwork somebody makes, so it is a file.

Because it is artwork for one theme, it is not offered to every design.
`src/lib/premium-openings.ts` is the catalogue: each clip names the designs it
was drawn for, and the collection it belongs to so a theme's next design
inherits it. An invitation is offered its own theme's clips and no others —
Capiz has one, the Baby Blue Theme has the Blue Bow with more to come, and a
christening is never shown a wedding's seal. A theme with more than one clip
becomes a choice: the customer picks theirs under Settings once the add-on is
on the order, staff can set it from the invitation's admin page, and the
design's row carries the first as its default, which is what the gallery
previews. Adding a clip is one entry in that file plus two files under
`public/openings`; the checkout gate, the picker and the guest's page all read
the catalogue.

What makes it affordable is that the file is still shared. One clip per
design, not per couple: the names never appear inside it, so the same few
hundred kilobytes serve every customer on that design and the CDN caches it
after the first guest. `preload="none"` means it is not fetched at all until
the tap, so it costs a guest who never opens the invitation nothing, and the
tap is a user gesture, which is what lets it play on iOS at all.

Because it is artwork rather than a setting, it is never offered in the
builder (`staffOnly`) and never chosen by a customer. It arrives with a
Done-For-You or Concierge order: staff attach the clip and its poster to the
design (`Template.openingVideoUrl`) or, for Concierge, to the one invitation
it was drawn for (`Invitation.openingVideoUrl`), from the DFY job page. The
poster is required alongside the clip, because that still *is* the closed
screen until the guest taps.

Generated video also has a place on the marketing pages — a hero loop, one
asset made once. What must not be a file is a *render per couple*: that is the
thing that cannot carry live text and cannot be made at self-serve prices.

Which opening a guest gets is `resolveOpening()`: the customer's choice
(`content.cover.opening`), else the design's default (`Template.opening`),
else none. An opening above the invitation's tier falls back to The Envelope
rather than to nothing, so a downgrade never leaves a guest looking at a blank
first screen where there used to be one.

Three things every opening must do, and the tests and the CSS enforce:

- **Work without JavaScript.** The overlay is server-rendered, so a `<noscript>`
  rule hides it outright — otherwise a guest with scripts off would tap a
  screen that never opens.
- **Respect `prefers-reduced-motion`.** The tap-to-open moment stays; nothing
  slides, sways or draws. The overlay simply fades.
- **Disappear from print.** `/[slug]/print` and Save as PDF render the
  invitation only.

The cinematic one adds two of its own, both tested: a clip that 404s or will
not decode reveals the invitation anyway rather than stranding the guest on a
screen that never opens, and under `prefers-reduced-motion` the poster stands
in — the same artwork, held still — and the clip never plays.

An invitation without the premium opening add-on is not served the clip at all: the `<video>` is
never rendered, so there are no bytes to decline. Its design's own drawn
opening carries on instead.

### The Moment, and where the scenery lives

An early version of the cinematic opening baked the scenery into the clip. It
should not: the clip is shared by every couple on a design, so a fixed view
hands a Batangas couple somebody else's horizon, and no encoder can change it
without commissioning new video.

So the scenery is a **page section**, not part of the opening. `moment` is a
frame — a capiz arch, a capiz window, or none — with three layers behind it
that are deliberately independent:

1. **the backdrop** — the couple's own photograph, which an encoder swaps at
   any time without touching anything else,
2. **the painted scene** (`src/lib/backdrops.ts`), used only when there is no
   photograph, because a snapshot often fights a design built from capiz and
   warm ivory, and forcing one in is worse than not,
3. **the words** — three short lines, typed by the customer like every other
   field.

Every painted scene is somewhere in the Philippines: El Nido, Batangas, Taal,
Boracay, Bohol, Banaue, Sagada, Intramuros. A couple marrying in Batangas is
not handed a lake in Lombardy because the illustration happened to be pretty.
A scene whose artwork does not exist yet is never offered, so the list can be
written ahead of the painting, and an unpainted choice leaves the frame
holding the page's own colour rather than a broken image.

The frame itself is drawn in CSS from the palette, not supplied as a second
image — so it re-skins with the design instead of needing one commission per
colourway. The arch is the backdrop's own `border-radius` rather than a hole
punched through an overlay, because an inverse mask has to hard-code the page
colour into a shadow, which then lies the moment a customer picks another
palette.

**Nothing on the opening is fixed copy either.** Both its lines — the one on
the closed screen and the one shown as it plays — are cover fields. An earlier
version hid the text layer on the cinematic opening on the reasoning that the
artwork carried the screen; that was wrong, and it meant the one opening a
customer pays most for was the one they could not put their own words on.

### Shipping a design

`prisma/templates.ts` is the catalogue, as data. The seed creates it on an
empty database; `npm run db:templates` upserts it into one that already has
customers — matching on slug, so a design keeps its id and every invitation
built on it keeps rendering. `-- --dry` lists the changes without writing
them. `published` is deliberately not synced: a design staff unpublished in
the admin stays unpublished.

In production, run the **Sync the invitation designs** workflow. It deletes
nothing, which is why it needs no confirmation phrase — unlike the seed, which
truncates the schema.

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

### The encoder's workspace

The client's form is already word for word and photo by segment, and it is
copied into the invitation the moment they submit it (`saveIntake`). What an
encoder adds is the fit: whether the intro sits on the cover, whether the
prenup photos are in the right order, whether a milestone was written in the
right box, whether the wording reads the way a guest should read it. **Encode**
on a job (`/admin/dfy/<job>/encode`) is built for exactly that, in three
columns:

- the segments in the order the page shows them, with a mark for what the
  client wrote (✎), what has been started and what has been checked off;
- the client's own answers for the segment in hand beside the form for it
  (every field, the fixed writings included), with one button to put their
  answers into the form and, for any list of photographs, a strip of
  thumbnails to reorder — the first is the large one at the top of a prenup
  page;
- the page itself, scrolled to that segment and reloaded on every save, so
  the encoder sees what the words do before the client does. The preview
  opens with `?bare=1`, which for a previewer drops the opening, the music and
  the day-and-night toggle; a guest's link never does.

Checking a segment off is the builder's Done mark, so the client's dashboard
and the encoder's progress agree. Marking the job as encoding and sending the
preview are one button each at the top.

### How much a writing can hold

Every text a client types has a limit sized to the page it lands on: a first
name is set large in script across a phone, a milestone's title sits inside a
drawn frame, a note under the palette is a line or two. `FIT` in
`src/lib/sections.ts` holds the number per field (`cover.intro`,
`story.timeline.title`, …), the type's default covers the rest, and every
section's fields carry it as `max`. The form counts it down once a third is
used and turns amber in the last stretch; the save cuts anything past it, in
the builder, the intake and the workspace alike. When a design gains or loses
room, the number changes in one place.

## Guest data and privacy

- A guest's personal link is `/<slug>/<token>` where the token is 18
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
stale unpaid orders, auto-closes Signature-package RSVPs after the deadline, and
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
   it is baked into every share link and QR code, so a QR printed on a hundred
   cards carries whatever this said at *build* time. It is a `NEXT_PUBLIC_`
   variable, which means changing it in the dashboard does nothing until the
   next build: redeploy after editing it. Production is
   `https://youreinvitedto.com`, with `www.` redirecting to the apex.
   Set `CRON_SECRET`.
6. **Seed** the production database once, then sign in as the Owner, change
   the passwords, and replace the demo's placeholder photos and the sample
   testimonials on the landing page.

   Seeding runs from GitHub Actions — *Seed the invitations database*, under
   Actions — because it needs both the connection string and a real Node
   runtime: the seed is several hundred sequential statements, which is fast on
   a local socket and slow enough over the network to outlive a serverless
   timeout. It needs two repository secrets: `INVITES_DIRECT_URL`, holding the
   Supabase **session pooler** string (port 5432; the seed uses prepared
   statements, which a transaction pooler multiplexes away), and
   `INVITES_SEED_PASSWORD`, the password the seeded accounts get. A secret
   rather than a workflow input, because inputs are kept and shown on the run's
   own page while secrets are masked in the log.

   Sign in to all three staff accounts and change their passwords before the
   site is public. The forced-change flag decides what the first person to
   arrive sees; it does not decide who arrives first.

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
  prisma/           schema, migrations, seed, the design catalogue
  scripts/          build guard, integrity check, jobs runner, design sync
  src/lib/          the domain: sections, tiers, pricing, copy, invitations,
                    orders, payments, guests, rsvp, dfy, reports, jobs,
                    plus auth, guard, rbac, db, storage, paymongo, email
  src/components/   invite renderer + client pieces, builder form engine,
                    landing page pieces, site chrome, shared UI
  src/app/          (public) /, /templates, /collections/*, /demo, /[slug],
                    policies
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

Blush, Garden and Midnight have one design each, carried over from the
existing catalogue; Filipiniana has two. White is declared but has no designs,
so it does not appear anywhere and `/collections/white` is a 404 — which is
the intended behaviour of a collection written ahead of its designs, and what
happened when an earlier set was withdrawn. Filling one out is a row per
design in `prisma/templates.ts` and a run of the sync workflow.
