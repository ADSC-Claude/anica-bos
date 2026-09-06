# Deploying ANICA Stays

Two things to create: a Supabase project for the database and storage, and a
Vercel project for the app. They are separate from the spa's, and share nothing
with it.

This takes about fifteen minutes, most of it waiting for a database to
provision.

---

## Before you start

| | |
|---|---|
| **Root Directory** on Vercel | `rental` — not the repository root, which is the spa |
| **Region** | Singapore (`sin1`) for Vercel, `ap-southeast-1` for Supabase — nearest to Manila |
| **Postgres** | 15 or later. `btree_gist` must be available (Supabase has 1.7) |

`rental/vercel.json` already pins the region and the two cron schedules. You do
not need to configure crons by hand.

---

## 1 — Supabase

### Create the project

Organization → **New project**, region **Southeast Asia (Singapore)**. Save the
database password Supabase generates; you need it in the next step and it is
shown once.

> **Free tier allows two active projects per owner.** If you already have two,
> Supabase refuses a third with a message naming the limit. Pause an unused one
> (Settings → General → Pause) or upgrade the organization. A paused project can
> be restored later, so pausing is the reversible option.

### Collect the two connection strings

Project → **Connect**. You need both, and they are different:

| Variable | Which string | Port |
|---|---|---|
| `DATABASE_URL` | **Transaction pooler** | 6543 |
| `DIRECT_URL` | **Session pooler** | 5432 |

Append `?pgbouncer=true&connection_limit=1` to `DATABASE_URL`. Serverless
functions each open their own connection, and without this a busy morning
exhausts the pool.

Both are on the **same pooler host** — only the port differs. That is not a
typo, and getting it wrong is the single most likely way to lose an evening.

`DIRECT_URL` exists because **a transaction pooler cannot run migrations** — it
multiplexes statements across connections, and `CREATE EXTENSION` and
`ALTER TABLE … ADD CONSTRAINT` need a session that stays put. Session mode
(port 5432 on the pooler) keeps the connection whole, so migrations work.

**Do not use the "Direct connection" string here, even though it is also port
5432 and looks like the obvious choice.** Supabase serves `db.<ref>.supabase.co`
over **IPv6 only**, and Vercel's build environment is IPv4-only, so the migration
cannot route to it at all:

```
Error: P1001: Can't reach database server at `db.<ref>.supabase.co:5432`
```

That error says nothing about IPv6 and reads like a wrong password or a paused
project. It is neither — the address simply has no A record. The session pooler
resolves to IPv4 and is the string to use.

One detail not to hand-edit: the pooler username is `postgres.<project-ref>`,
while the direct connection's is plain `postgres`. Copy the whole string from
the Connect dialog and substitute only the password.

`scripts/build.mjs` refuses to build if `DATABASE_URL` points at port 6543 and
`DIRECT_URL` is missing, rather than letting the migration fail halfway through
a deploy.

### Create the two storage buckets

Storage → **New bucket**, twice:

| Name | Public | Holds |
|---|---|---|
| `stays-public` | yes | property photos |
| `stays-private` | **no** | receipts, permits, checklist and inspection photos |

A permit or a receipt on a public bucket is a permit or a receipt anyone can
read. The app writes to whichever bucket the visibility argument selects; it
does not fall back to the public one.

### About Row Level Security

Supabase will warn that RLS is disabled on every table Prisma creates. **That
warning is real and the migration `20260818230000_lock_down_postgrest_access`
is what answers it.** It runs automatically; there is nothing to click.

The danger is not the one it sounds like. Nothing here uses Supabase Auth or
the supabase-js client, so there is no browser holding an anon key — but that
was never the threat. Supabase serves the `public` schema over a REST API at
`https://<project-ref>.supabase.co/rest/v1/`, that endpoint is open to the
internet, and **the anon key is designed to be public.** Out of the box the
`anon` role is granted SELECT and INSERT on every table, so anyone who has the
key can read `User` password hashes, `Guest` contact details, `AccessRecord`
door codes and `Payment` rows — and insert rows of their own. Not through the
app. Straight past it.

Since this app never calls that API, the migration closes it rather than
policing it, in two layers:

| Layer | Does |
|---|---|
| `ENABLE ROW LEVEL SECURITY` on all tables, no policies | PostgREST connects as `anon` and matches nothing |
| `REVOKE` all grants from `anon` and `authenticated`, including default privileges for future tables | there is no privilege left behind the RLS, if RLS is ever switched off again |

**Prisma is unaffected, and the reason matters:** it connects as `postgres`,
which owns every table, and a table owner bypasses RLS unless
`FORCE ROW LEVEL SECURITY` is set — which it deliberately is not. Do not set
it. Doing so locks the application out of its own database.

To check the door is shut:

```sql
SELECT count(*) FILTER (WHERE NOT c.relrowsecurity)                         AS no_rls,
       count(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'SELECT')) AS anon_readable
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';
```

Both must be `0`. Run it after any restore — a restore can bring back the
grants along with the data.

Beyond that, **the service-role key and the connection strings are the whole
security boundary.** They belong in Vercel's environment variables and nowhere
else: never in the repository, never in a message. Every request that does
reach the app is gated twice — a permission check and a property/assignee scope
check, both in `src/lib/guard.ts`, both proven over real HTTP by
`npm run test:live`.

If you ever add a client-side Supabase integration, this migration is what you
will need to unpick, and every table will need a real policy before that ships.

---

## 2 — Vercel

### Create the project

**Add New → Project**, import `ADSC-Claude/anica-bos`, then — before deploying —
set:

- **Root Directory**: `rental`
- **Framework Preset**: Next.js (detected)
- **Build Command**: leave it; `rental/vercel.json` sets `node scripts/build.mjs`

The repository root is the spa. If Root Directory is left blank you will deploy
the spa a second time under a new name.

### Environment variables

Required — the build fails without them, deliberately, rather than surfacing as
a 500 on a live page:

| Variable | Value |
|---|---|
| `DATABASE_URL` | pooled string, port 6543, with `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | **session pooler** string, port 5432 — not the direct connection, see above |
| `SESSION_SECRET` | `openssl rand -base64 48` |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | the production URL, no trailing slash |

Everything else degrades to something usable, so the site works before any of it
is set:

| Variable | Blank means |
|---|---|
| `PAYMONGO_SECRET_KEY` | simulated checkout — a local page that posts through the real webhook handler |
| `PAYMONGO_WEBHOOK_SECRET` | webhook signature checking is off; set it the moment the key is set |
| `RESEND_API_KEY` | email is logged to the console and recorded as "logged", not sent |
| `EMAIL_FROM` | falls back to a placeholder; set it before sending anything real |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | uploads go to local disk, which on Vercel means they vanish at the end of the request. **Set these before anyone uploads a receipt.** |
| `NEXT_PUBLIC_CONTACT_PHONE` + `NEXT_PUBLIC_CONTACT_EMAIL` | the error page offers no way to reach a person. These are read at build time, not from the database, precisely so they still work when the database is what broke. Worth setting. |
| `VERCEL_ANALYTICS_TOKEN` + `VERCEL_ANALYTICS_PROJECT_ID` + `VERCEL_ANALYTICS_TEAM_ID` | Portal → Reports → Visitors shows setup instructions instead of numbers. See "Visitor statistics" below. |

`NEXT_PUBLIC_APP_URL` is the one that is easy to forget and awkward to notice:
it is what emails, PayMongo redirects and iCal feed URLs are built from. Wrong,
and payment redirects land on the wrong host and Airbnb subscribes to a feed
that does not answer.

### Deploy

The build runs `prisma generate`, then `prisma migrate deploy` over `DIRECT_URL`,
then `next build`. The migration creates `btree_gist` and the exclusion
constraint. If that step fails, nothing else matters — read the log before
retrying.

---

### Visitor statistics

Web Analytics itself is a Vercel dashboard toggle (project → Analytics →
Enable, then one redeploy so the counting script starts being served). That
alone gives you the numbers **in Vercel's dashboard**.

To also see them inside the portal (Reports → Visitors), give the app read
access to the counter:

1. Create a token at vercel.com → Account settings → Tokens, scoped to the
   team that owns this project. It is shown once — copy it then.
2. Add three environment variables to the project and redeploy:

| Variable | Value for this deployment |
|---|---|
| `VERCEL_ANALYTICS_TOKEN` | the token from step 1 (mark it Secret) |
| `VERCEL_ANALYTICS_PROJECT_ID` | `prj_Xw0iXfZORW6H5WLe0Ycu2vOZAZYt` |
| `VERCEL_ANALYTICS_TEAM_ID` | `team_VSie06rBuV9COf79igunAFEa` |

The page refreshes its numbers every ten minutes, counts the public site
only (never `/portal` or `/login`), and degrades to instructions — not an
error — whenever any of the three is missing.

## 3 — First run

### Seed, or start empty

To start with the sample business — three properties, seven roles, fifteen
guests, twenty-five bookings — run against the production database from your
machine:

```bash
cd rental
DATABASE_URL="<direct string, port 5432>" npm run db:seed
```

It prints eight sign-ins sharing one password, every one forced to change it
before reaching anything.

To start empty instead, create the first Owner by hand:

```bash
cd rental
DATABASE_URL="<direct string>" npx tsx --conditions=react-server -e "
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const p = new PrismaClient();
const branch = await p.branch.create({ data: { name: 'Metro Manila', city: 'Manila' } });
await p.user.create({ data: {
  email: 'owner@example.com',
  name: 'Owner',
  role: 'OWNER',
  branchId: branch.id,
  passwordHash: await bcrypt.hash('ChangeThisNow!', 11),
  mustChangePassword: true,
} });
await p.\$disconnect();
"
```

Then sign in and change the password immediately — the account cannot reach
anything until you do.

### Check it

```bash
cd rental
DATABASE_URL="<direct string>" npm run verify
```

Nine invariants: no overlapping spans, the exclusion constraint exists, every
live reservation holds its dates, cancelled ones hold nothing, `paidCents`
matches its payments, every breakdown sums to its total, nights match their date
range, stock matches its ledger, and nothing claims READY with turnover work
open.

Run the same command after any restore. It is the check that tells you the
restore worked.

---

## 4 — PayMongo

1. Dashboard → **Developers → API keys**. Copy the secret key. There is no
   publishable key to copy: checkout sessions are created server-side, so
   nothing ever runs in the browser.
2. **Webhooks → Create**, pointing at `https://<your-domain>/api/webhooks/paymongo`,
   subscribed to `checkout_session.payment.paid` and `payment.failed`.
3. Copy the webhook secret — shown once, starts `whsk_` — into
   `PAYMONGO_WEBHOOK_SECRET`.
4. Redeploy.

Test and live endpoints have different secrets. A live key with a test webhook
secret means every real payment is rejected as unsigned, which looks exactly
like a gateway outage.

The webhook is the **only** thing that marks a payment paid. The browser
returning from a checkout page never is — a guest who closes the tab has still
paid, and one who fakes the redirect has not.

---

## 5 — Airbnb

Per property, in the portal at **Properties → (a property) → Airbnb calendar**:

- **Export**: copy the feed URL into Airbnb's *Import calendar*. The token in
  the URL is the only thing protecting it, so treat it as a password. It carries
  dates and nothing else — never a guest name, never a door code.
- **Import**: paste Airbnb's *Export calendar* URL into Settings. It is polled
  every fifteen minutes.

A collision between an imported stay and one already on the books is **reported,
not resolved** — it raises an alert naming both, because guessing which booking
to keep is how somebody arrives at a flat that is already occupied.

---

## Cron

`rental/vercel.json` declares both jobs. Vercel picks them up on deploy:

| Path | Schedule | Does |
|---|---|---|
| `/api/jobs/minute` | every 15 min | sends due messages, expires unpaid holds, polls Airbnb, refreshes ready states |
| `/api/jobs/daily` | 22:00 UTC (06:00 Manila) | arrivals, unready alerts, overdue cleans, balances due, low stock, document expiry, no-shows, completions |

Both require the `CRON_SECRET` bearer and both are idempotent — running one
twice produces the same state, and alerts deduplicate rather than accumulating
ninety-six copies of one warning a day.

To check them by hand:

```bash
curl -H "authorization: Bearer $CRON_SECRET" https://<your-domain>/api/jobs/daily
```

---

## Backups

Supabase provides point-in-time recovery on paid plans; on free it is daily.
Either way, take your own copy as well — a backup you cannot restore without
your vendor's cooperation is a backup with a condition attached:

```bash
cd rental
DATABASE_URL="<direct string>" npm run backup      # writes a portable JSON dump
DATABASE_URL="<direct string>" npm run restore -- <file>
```

`restore` refuses to run over a database that already holds reservations unless
you pass `--force`. Full procedure, and the RPO/RTO table, in
[docs/09](./docs/09-security-and-backup.md).

---

## If something is wrong

| Symptom | Cause |
|---|---|
| **Build succeeds, deployment says Ready, but every page 500s** | `DATABASE_URL` is the **direct** connection. Migrations ran because they use `DIRECT_URL`, so the build passed — but the running app cannot reach `db.<ref>.supabase.co` over IPv4, so every page that reads the database throws. Use the **transaction pooler**, port 6543, with `?pgbouncer=true&connection_limit=1`. This one is nasty because a green build and a Ready badge both suggest the deploy worked. |
| Build fails naming a missing variable | It is missing. The build refuses rather than shipping a 500. |
| Build fails on `migrate deploy` with `P1001: Can't reach database server` | `DIRECT_URL` is the **direct** connection, which Supabase serves over IPv6 only and Vercel cannot reach. Use the session pooler: same pooler host, port 5432. |
| Build fails on `migrate deploy` some other way | `DIRECT_URL` absent, or pointing at port 6543. Migrations need session mode. |
| `prepared statement already exists` at runtime | `?pgbouncer=true` is missing from `DATABASE_URL`. |
| Payments never confirm | Webhook URL wrong, or the secret is from the other environment. Check PayMongo's delivery log. |
| Emails do not arrive | `RESEND_API_KEY` blank — they are being logged, not sent. Check the function logs. |
| Uploads vanish | `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` blank, so files went to the container's disk. |
| Airbnb shows nothing | The feed URL was copied before the property had bookings, or into the wrong field — export and import are different boxes. |
