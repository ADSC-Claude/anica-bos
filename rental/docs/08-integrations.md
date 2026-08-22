# 8 — Integrations

Four external services in v1. Each is wrapped in a module of our own so the
application never talks to a vendor's shape directly, and each degrades to
something usable when its credentials are absent — so a fresh clone runs the
whole booking chain with an empty `.env`.

| Service | Used for | Without a key |
|---|---|---|
| **PayMongo** | GCash, Maya, cards, online banking; refunds | Simulated local checkout |
| **Resend** | Transactional and campaign email | Logged to console, recorded as `logged` |
| **Airbnb iCal** | Two-way calendar sync | Feature simply has no feeds configured |
| **Supabase Storage** | Photos, receipts, documents | Falls back to local `public/uploads` in dev |

---

## 8.1 PayMongo — `lib/payments/paymongo.ts`

**Checkout Sessions**, not Payment Intents: the session is a hosted page that
already handles GCash, Maya, card and online banking, so we never render a card
field and no card data ever reaches our servers or our logs.

```
POST /booking ──▶ reservation PENDING (+ span held)
              ──▶ createCheckoutSession(amount = deposit or total)
              ──▶ 302 to PayMongo
guest pays    ──▶ webhook  checkout_session.payment.paid   ← the only truth
              ──▶ Payment PAID · reservation CONFIRMED
              ──▶ 302 back to /book/confirmation/[ref]     ← display only
```

- **Signature verification.** `paymongo-signature: t=…,te=…,li=…`; the signature
  is `HMAC-SHA256("{t}.{rawBody}", PAYMONGO_WEBHOOK_SECRET)`, compared with
  `timingSafeEqual`, rejected beyond five minutes old. Test and live endpoints
  have different secrets and the mode picks which field to read.
- **Idempotency.** Webhooks are retried. Every handler is keyed on the gateway's
  event id and returns `200` for an event already applied — a duplicate must
  never create a second `Payment` row.
- **Events handled**: `checkout_session.payment.paid`, `payment.paid`,
  `payment.failed`, `payment.refunded`.
- **Floors**: PayMongo declines under ₱20.00 and refunds under ₱1.00. Both are
  enforced before the call so failures do not appear at the gateway.
- **Refunds** are issued against a *payment* (`pay_…`), but which id we hold
  depends on which webhook arrived first. `resolvePaymentId()` turns a session
  id into a payment id; when it cannot, the refund is recorded as owed and
  flagged for manual settlement rather than silently dropped.
- **Balance payments** reuse the same path with `kind = BALANCE`; the link in
  the balance-due email is `/book/pay/[reference]`, which creates a fresh session
  for exactly the outstanding amount.

**Simulated mode** (`PAYMONGO_SECRET_KEY` unset) returns a local URL that posts
back through the same webhook handler with a synthetic payload. The code path
under test is the real one; only the gateway is stubbed.

---

## 8.2 Email — `lib/email.ts`

Resend over HTTPS. No SDK — one `fetch` to `POST /emails`, because a mail
dependency is a supply-chain risk on the pipe that carries access codes.

Every send is recorded: recipient, subject, template key, rendered body, status
(`sent` / `logged` / `failed`) and the provider's error if any. The reservation
page shows that timeline, so "did she get the check-in instructions?" is
answered by looking rather than by guessing.

Templates live in the database (`MessageTemplate`), seeded with defaults and
editable in Settings with `{{placeholder}}` substitution. Editing a template
does not rewrite messages already sent — `ScheduledMessage` stores the body it
rendered at send time.

Deliverability, documented for whoever sets up the domain: SPF, DKIM and DMARC
on the sending domain; the `From` address on the business's own domain, never a
free mailbox; one-click unsubscribe on every marketing send; transactional and
marketing sends kept on separate subdomains so a campaign complaint cannot take
down check-in instructions.

---

## 8.3 Airbnb calendar sync — `lib/sync/`

iCal is what Airbnb offers without a partnership, and it is honest about its
limits: it carries dates, not money, not guest details, and it updates on
Airbnb's own schedule (typically every few hours). We treat it as a **block
feed**, not a booking feed.

### Behind an interface

```ts
export interface ChannelSync {
  readonly id: string;                                   // 'ical' | 'channel-manager'
  pull(property: Property): Promise<ExternalStay[]>;
  push?(property: Property, span: CalendarSpan): Promise<void>;
  capabilities: { guestDetails: boolean; realtime: boolean; pricing: boolean };
}
```

v1 ships one implementation, `IcalSync`, whose `push` is undefined — export is a
pull by Airbnb from our feed, not a push by us. A channel manager later
implements the same interface with `realtime: true` and the scheduler stops
polling that property. No schema change: `IcalFeed` already carries the
provider, and `Reservation.externalUid` already carries the other side's key.

### Export — `GET /api/ical/[token].ics`

One feed per property at an unguessable token (32 chars from the same
ambiguity-free alphabet). Contains every span that holds dates —
reservations and blocks alike — as `VEVENT`s with `DTSTART;VALUE=DATE` /
`DTEND;VALUE=DATE` and a stable `UID` of `{spanId}@{host}`. Summaries carry no
guest names: the feed is a URL, and a URL leaks.

Written by hand against RFC 5545 (~80 lines): correct `CRLF` line endings,
75-octet line folding, `PRODID`, `X-WR-CALNAME`, and no `VTIMEZONE` because
every event is a whole-day value. Validated in CI against a fixture and, before
go-live, against an external validator.

### Import — every 15 minutes

```
fetch feed → parse VEVENTs → for each:
    known UID?  → dates changed?  → move the span (rolls back on conflict)
    new UID?    → create Reservation(source AIRBNB, status CONFIRMED, total 0)
                  + CalendarSpan
    stamp lastSeenAt
after the loop:
    events not stamped this round → the other side cancelled → release span
    record lastSyncAt / status / error, raise SYNC_FAILED after two failures
```

**The overlap that iCal cannot prevent.** Two systems polling each other every
15 minutes have a window in which both can sell the same night. Ours is
narrowed, not closed: our own site cannot double-book because of the exclusion
constraint, and an Airbnb import that collides with a direct booking **does not
overwrite it** — it records a `SYNC_CONFLICT` notification naming both stays and
leaves a human to sort it out. Silently dropping either one is worse than
telling someone.

Each property shows `Last synced 6 minutes ago` and a warning when a feed has
failed, because a sync that quietly stopped a week ago is how a unit gets
double-sold.

---

## 8.4 Supabase Storage — `lib/storage.ts`

Photos (property gallery, checklist evidence, incident damage), receipts and
documents. Reached over the Storage REST API with the service-role key,
server-side only — the key is never sent to a browser and no upload goes direct
from a client.

- Buckets: `public` (property gallery, served with long cache headers) and
  `private` (receipts, documents, checklist photos, incident photos).
- Private objects are read through signed URLs minted per request, valid one
  hour, so a leaked link expires.
- Uploads pass through `POST /api/portal/upload`, which checks the session and
  the module permission, caps the size, and accepts only image and PDF MIME
  types verified by magic bytes rather than by file extension.
- Paths are `{bucket}/{entityType}/{entityId}/{uuid}.{ext}` — no user-supplied
  filename ever reaches the storage path.

Without `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` the module writes to
`public/uploads` and returns local paths, so development and CI need no cloud
account.

---

## 8.5 Future integrations, and what each would touch

| Integration | Seam it plugs into | Schema change |
|---|---|---|
| Channel manager (real-time OTA) | second `ChannelSync` implementation | none |
| Smart locks (Igloohome, TTLock) | `AccessRecord.method = SMART_LOCK`; issue on check-in, revoke at checkout | add `deviceId`, `externalId` |
| SMS (Semaphore, PH) | `MessageTemplate.channel = SMS`; a dispatcher beside the email one | none |
| WhatsApp Business | same dispatcher seam | none |
| Accounting export (QuickBooks/Xero) | a report writer over `Payment` + `Expense` | none |
| Multiple owners, per-owner statements | `Property.ownerId` + a statement report | one nullable column |
| Dynamic pricing | writes `RateOverride` rows | none |
| Additional gateways | `Payment.method` + a second gateway module | none |

The point of the table is that none of the rows say "restructure the
reservation". That is what §12 means by *schema-ready*.

---

## 8.6 Environment variables

| Variable | Required | Effect when absent |
|---|---|---|
| `DATABASE_URL` | **yes** | nothing runs |
| `DIRECT_URL` | migrations, when pooled | migrations fail against a transaction pooler |
| `SESSION_SECRET` | **yes**, 32+ chars | refuses to boot |
| `NEXT_PUBLIC_APP_URL` | yes in production | links in emails point at localhost |
| `PAYMONGO_SECRET_KEY` | no | simulated checkout |
| `PAYMONGO_WEBHOOK_SECRET` | with the above | webhooks rejected |
| `RESEND_API_KEY` / `EMAIL_FROM` | no | email logged, not sent |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | no | local file storage |
| `CRON_SECRET` | yes in production | job endpoints refuse every request |
