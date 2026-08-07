# 9 — Security, privacy, backup and recovery

## What is actually at risk

Ranked by what it would cost the business, not by what sounds alarming.

| Asset | If it leaked / were lost |
|---|---|
| **Access codes and Wi-Fi passwords** | Someone can enter a property. The single most damaging item here. |
| Guest contact details | Data Privacy Act exposure, reputational damage, a real duty to notify |
| The calendar | Double bookings, evicted guests, refunds, reviews |
| Financial records | Reconstruction from bank statements; BIR exposure |
| Staff credentials | Everything above, wearing someone else's name |

Note what is *not* on the list: card numbers. PayMongo holds them; we never
render a card field, never receive a PAN, and never log one. That is a
deliberate reduction in scope rather than an accident.

## Authentication

- Passwords are **bcrypt, cost 11**. Never logged, never emailed, never returned
  by an API.
- Sessions are **HS256 JWTs in an httpOnly, SameSite=Lax, Secure cookie**, 12
  hours. No token in `localStorage`, so an XSS cannot walk off with one.
- A valid cookie is not a valid account. Every guarded request re-checks
  standing: deleted, deactivated, or `sessionsRevoked` newer than the token's
  `iat` all end the session immediately. Disabling a cleaner at 10am locks them
  out at 10am, not at midnight.
- **Rate limiting** on sign-in: 8 failures per email in a rolling 15 minutes,
  counted from the persisted `LoginEvent` table — no extra infrastructure, and
  the attempts are auditable.
- Seeded accounts carry `mustChangePassword`; the first sign-in cannot reach
  anything else until it is done.
- `SESSION_SECRET` under 32 characters throws at boot rather than degrading
  quietly.

## Authorization

Two gates on every request, described in [document 3](./03-roles-and-permissions.md):
permission, then property/assignee scope. Both are server-side. The UI hides
what the server refuses; it is never the thing doing the refusing.

`tests/live/rbac-live.ts` signs in as each of the seven roles over real HTTP and
asserts the expected `200` / `403` / redirect for every guarded route and
endpoint — including the ones a role's navigation never shows, which is exactly
where a hole would hide.

## Guest-facing access without accounts

`/manage/[reference]` and the check-in form are reachable by anyone holding a
booking reference. So a reference alone is not enough:

- The reference is 6 characters from a 32-symbol ambiguity-free alphabet (~1
  billion combinations), and it must be presented **with the email or mobile on
  the booking**.
- Failed attempts are rate limited per reference and per IP.
- **Access codes and the Wi-Fi password are released only after check-in**, and
  only to a reservation in the right state. A booking reference read over
  someone's shoulder in May does not open a door in July.
- Review and unsubscribe links carry single-purpose random tokens, not
  reservation ids.

## Input, output and transport

- Every mutation validates with Zod at the boundary; the parsed value is what
  reaches the database.
- Prisma parameterises everything. The one raw query in the system
  (`lib/calendar/span.ts`, for the range predicate) is parameterised by hand and
  is covered by a test that feeds it hostile input.
- React escapes by default and there is no `dangerouslySetInnerHTML` anywhere in
  the tree. Rich text is not a feature; the property description is text.
- Uploads: size-capped, MIME verified by **magic bytes** rather than extension,
  stored under generated paths — a user-supplied filename never reaches the
  storage layer.
- Headers set in `next.config.ts`: HSTS with preload, `X-Content-Type-Options`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`,
  and a CSP without `unsafe-eval`.
- Server Actions are POST-only and origin-checked by Next.js; the cron endpoints
  take a bearer secret; the webhook takes an HMAC.
- Secrets live in Vercel environment variables. `.env` is git-ignored;
  `.env.example` documents every key with no value in it.

## Privacy — Data Privacy Act of 2012 (RA 10173)

**Collect the minimum.** Name, email, mobile, country. Companions are a count
and names — the practical minimum for a guest register. No ID numbers, no ID
photographs, no passport scans, no dates of birth unless a guest volunteers one
for a birthday offer.

| Principle | How it is met |
|---|---|
| Transparency | The booking form says what is collected and why, in a sentence, next to the fields |
| Legitimate purpose | Contact details are used for the stay and for legal records; marketing needs a separate, unticked consent box |
| Proportionality | Nothing sensitive is collected, so nothing sensitive can leak |
| Consent | `marketingConsent` with a timestamp; withdrawal is one click and takes effect immediately |
| Access | A guest may ask for their profile; the CRM page prints it |
| Erasure | Anonymises the profile and keeps the reservation totals the books require, with the audit trail recording that it happened |
| Retention | Guest records are kept while a business record exists; marketing consent lapses after 3 years without a stay |
| Breach response | Procedure below |

Access codes and Wi-Fi passwords are treated as credentials: shown only to roles
that need them, never included in an iCal feed, never in a subject line, and
scrubbed from any export.

## Audit

Every create, edit, cancellation, refund, incident and permission change writes
an `AuditLog` row: who, what, when, from which IP, with **before and after
values** as a shallow diff. Nothing in the application updates or deletes a row
in that table.

Financial records and reservations are never hard-deleted. A cancellation is a
status change carrying a reason and an author; a refund is a negative payment
beside the original, not an edit to it.

## Backup and recovery

Three layers, because a backup you have not restored is a rumour.

**1 — Supabase PITR (continuous).** Point-in-time recovery on the Pro plan lets
the database be restored to any second within the retention window. This is the
layer that saves you from `DELETE` without a `WHERE`.

**2 — Nightly logical export (automated).** `scripts/backup.ts` writes a
timestamped JSON snapshot of every table. Run by GitHub Action nightly, retained
30 days as a build artifact, and downloadable from
`/portal/settings/backup` by the Owner. Portable: it restores into any Postgres,
which matters if Supabase is one day not the host.

**3 — Owner-held copy (manual, monthly).** The Owner downloads the export and
keeps it off the platform. This is the layer that survives an account lockout, a
billing lapse, or a vendor decision nobody consulted us about. **The owner
retains control of her data** — nothing leaves this system automatically, and
every export is initiated by a person.

### Restore procedure

Rehearse this on a scratch project before you need it. Time it. Write the time
down.

```bash
# 1. Stop writes. Vercel → Settings → Deployment Protection → pause.
# 2. Choose a target:
#      recent mistake      → Supabase Dashboard → Database → Point in time
#      corruption / vendor → the JSON snapshot
# 3. Restore the schema, then the data:
npx prisma migrate deploy
npm run restore -- backups/2026-08-07.json
# 4. Verify before reopening:
npm run verify           # spans do not overlap; paidCents matches its payments;
                         # every reservation's lines sum to its total
# 5. Resume writes, then re-poll the iCal feeds so any OTA booking taken
#    during the outage lands:
curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/jobs/minute
```

| Scenario | Layer | RPO | RTO |
|---|---|---|---|
| Bad edit / accidental delete | audit log, then PITR | seconds | minutes |
| Table wiped | PITR | seconds | ~30 min |
| Supabase project lost | nightly export | ≤24h | ~2h |
| Vendor account lost | owner's monthly copy | ≤30d | ~1 day |

`scripts/verify-integrity.ts` runs in CI on the seeded dataset and is the same
command used after a restore, so the check that says "the books reconcile" is
exercised continuously rather than written once and trusted.

## Incident response

1. **Contain** — revoke sessions (`sessionsRevoked` on the affected accounts),
   rotate `SESSION_SECRET`, rotate PayMongo and Supabase keys.
2. **Assess** — the audit log and `LoginEvent` say what was reached and by whom.
3. **If access codes were exposed**, change them on the affected properties
   immediately and issue new `AccessRecord`s. This ranks above the paperwork.
4. **Notify** — RA 10173 requires notifying the National Privacy Commission and
   affected individuals within **72 hours** of discovering a breach involving
   sensitive personal information or one likely to cause real harm.
5. **Record** — write what happened, what was done, and what changed so it
   cannot recur.

## Pre-launch checklist

- [ ] `SESSION_SECRET` rotated to 48 random bytes; not the seeded value
- [ ] Every seeded password changed; `mustChangePassword` honoured
- [ ] PayMongo switched to live keys and a live webhook secret; a real ₱20
      payment taken and refunded end to end
- [ ] Resend domain verified with SPF, DKIM and DMARC
- [ ] `CRON_SECRET` set; both job endpoints return `401` without it
- [ ] Supabase PITR enabled; a restore rehearsed and timed
- [ ] Nightly backup Action running; one snapshot downloaded and restored
- [ ] iCal export URLs regenerated after any period of sharing during setup
- [ ] `tests/live/rbac-live.ts` green against the deployed URL
- [ ] Wi-Fi passwords and access codes changed from their seeded values
