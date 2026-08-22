# 6 — Automation and notification map

Three kinds of automation, and it matters which is which:

- **Inline** — happens inside the transaction that caused it. Cannot be lost,
  cannot arrive late, cannot half-happen.
- **Scheduled** — a row written now, drained later by cron. Survives a redeploy
  because it is in the database, not in memory.
- **Polled** — cron looks at the world and reacts. Idempotent by construction:
  running it twice changes nothing.

## Inline automations

| # | Trigger | Actions, all in one transaction |
|---|---|---|
| 1 | Booking submitted | Upsert guest (dedupe on email/mobile) → insert reservation `PENDING` → **insert `CalendarSpan`** → insert breakdown lines → record promo redemption |
| 2 | Payment webhook `paid` | Insert `Payment` → recompute `paidCents` + `paymentStatus` → reservation → `CONFIRMED` → `SecurityDeposit` `HELD` → **schedule the 8-message sequence** → create `ARRIVAL_PREP` task → recompute guest totals and tier |
| 3 | Reservation cancelled | Status → `CANCELLED` → **delete span** → cancel unsent scheduled messages → cancel open tasks → record refund if policy owes one → audit with before/after |
| 4 | Dates or property edited | Delete old span → insert new span (rolls back whole edit on conflict) → re-price → reschedule messages → move open tasks |
| 5 | Check-in recorded | Status → `CHECKED_IN` → release access instructions → send access email → cancel pre-arrival messages still pending |
| 6 | **Check-out recorded** | Status → `CHECKED_OUT` → **create `CleaningTask`** with deadline = next check-in → create cleaning `Task` → `readyState = CLEANING` → block dates if no same-day arrival → schedule review request |
| 7 | Cleaning checklist completed | Validate required photos → `INSPECTION` → create `Inspection` task → write restock `InventoryMovement`s → open incidents for damage found |
| 8 | Inspection passed | Cleaning `COMPLETED` → release cleaning block → `readyState = READY` → resolve any "unit not ready" notification |
| 9 | Inspection failed / needs attention | Cleaning back to `IN_PROGRESS` with notes → notify manager → maintenance ticket if structural |
| 10 | Maintenance completed with a cost | Ticket `COMPLETED` → create `Expense` against the property → release any emergency block |
| 11 | Incident resolved as "charge to deposit" | Deduct from `SecurityDeposit` → status `COLLECTED` / `PARTIALLY_RETURNED` → negative `Payment` for the returned part |
| 12 | Any create / edit / cancel / refund | `AuditLog` row with before and after values |

## Scheduled messages — the guest sequence

Written when payment confirms; drained by `POST /api/jobs/minute`. Every row is
addressed, rendered and timestamped, so the reservation shows one timeline of
what was sent and what is still coming.

| Template | When | Cancelled if |
|---|---|---|
| `booking_confirmed` | immediately | — |
| `balance_due` | *N* days before check-in (Settings, default 7) | balance already zero |
| `pre_arrival` | 3 days before check-in, 9am Manila | cancelled reservation |
| `checkin_day` | check-in day, 8am Manila | cancelled / no-show |
| `post_checkin` | check-in day, 7pm Manila | not checked in |
| `checkout_reminder` | evening before checkout, 6pm Manila | already checked out |
| `post_checkout` | checkout day, 12pm Manila | — |
| `review_request` | 1 day after checkout | reservation cancelled |

Timing is per-template and editable in Settings; the table above is the seeded
default. Direct guests get a review link on our own site; Airbnb guests get a
nudge to review on Airbnb, because we cannot collect it for them.

**Channel.** Email in v1, through Resend. Every message body is also rendered
into a copy-to-clipboard block on the reservation page, so a staff member can
paste it into WhatsApp or Messenger. SMS and WhatsApp are Future Phase — the
`channel` column exists, the dispatchers do not.

## Polled automations — cron

### Every 15 minutes — `POST /api/jobs/minute`

| Job | Behaviour |
|---|---|
| Dispatch messages | Sends every `ScheduledMessage` with `scheduledFor <= now`, marks `SENT`/`FAILED`, retries a failure up to 3 times |
| Expire holds | Cancels `PENDING` reservations past `holdExpiresAt`, deletes their spans |
| Poll Airbnb iCal | Per import feed: fetch → parse → upsert events → create/update source=`AIRBNB` reservations and spans → stamp `lastSeenAt` → release spans for events that vanished → record sync health |
| Refresh ready states | Recomputes `readyState` for properties with open turnover work |

### Daily, 06:00 Manila — `POST /api/jobs/daily`

| Job | Notification | To |
|---|---|---|
| Arrivals and departures today | `ARRIVALS_TODAY` | Owner, Manager, Reservations |
| Unit not ready and arrival within 6h | `UNIT_NOT_READY` **urgent** | Owner, Manager |
| Cleaning overdue past deadline | `CLEANING_OVERDUE` | Owner, Manager |
| Emergency maintenance still open | `EMERGENCY_MAINTENANCE` | Owner, Manager, Maintenance |
| Balance due within 3 days, unpaid | `BALANCE_DUE` | Owner, Manager, Reservations |
| Payment failed in the last 24h | `PAYMENT_FAILED` | Owner, Manager, Reservations |
| Inventory at or below minimum | `LOW_STOCK` | Owner, Manager |
| Document expiring: 60 / 30 days, then weekly, then daily once expired | `DOCUMENT_EXPIRY` + email to Owner | Owner, Manager |
| iCal feed failed twice running | `SYNC_FAILED` | Owner, Manager |
| Review received | `NEW_REVIEW` | Owner, Manager |
| Guest lapsed past their usual gap | `RETENTION` | Owner, Manager |
| No-show sweep: `CONFIRMED`, check-in yesterday, never arrived | flags `NO_SHOW` | — |
| Complete finished stays: `CHECKED_OUT` + settled + review sent | flags `COMPLETED` | — |

Both endpoints take `Authorization: Bearer $CRON_SECRET`. Vercel Cron drives
them in production; `npm run jobs:daily` drives them locally.

## Notification rules

Every notification carries a `dedupeKey` and a `link`.

- **`dedupeKey` prevents the same alert appearing every 15 minutes.** Re-raising
  an existing unresolved key is a no-op.
- **Conditions that stop being true resolve themselves.** Stock goes above
  minimum → the low-stock alert disappears. Nobody dismisses alerts by hand and
  then wonders whether the problem went away.
- **Every alert clicks through to the record**, never to a filtered list the
  reader then has to search. "Cleaning overdue — Bulacan house" opens that task.
- **Routing is by role and property.** A manager assigned to two properties is
  not woken up about the third.

## Notification catalogue

| Kind | Severity | Link | Auto-resolves when |
|---|---|---|---|
| `NEW_BOOKING` | info | reservation | read |
| `ARRIVALS_TODAY` | info | calendar/day | next day |
| `UNIT_NOT_READY` | **urgent** | task | inspection passes |
| `CLEANING_OVERDUE` | high | task | task completes |
| `EMERGENCY_MAINTENANCE` | **urgent** | ticket | ticket completes |
| `COMPLAINT` | high | incident | incident resolves |
| `LOW_STOCK` | medium | inventory | stock rises above minimum |
| `BALANCE_DUE` | medium | reservation | balance reaches zero |
| `PAYMENT_FAILED` | high | reservation | a later payment succeeds |
| `DOCUMENT_EXPIRY` | medium → high | document | expiry date moves forward |
| `SYNC_FAILED` | high | settings/sync | a poll succeeds |
| `NEW_REVIEW` | info | review | responded to |
| `RETENTION` | low | guest | guest books again |

## Chain integrity

`tests/automation-chain.test.ts` walks one reservation from booking to review
request and asserts at each step that the next automation fired: the span
exists, the messages are scheduled, the cleaning task carries the right
deadline, the inventory moved, the property came back to `READY`, and the
revenue reached the dashboard — with no write in the test other than the six
human actions a real stay involves.
