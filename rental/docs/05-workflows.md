# 5 — Workflows

## 5.1 Reservation lifecycle

```mermaid
stateDiagram-v2
    [*] --> INQUIRY: enquiry form / phone
    [*] --> PENDING: booked online, awaiting payment
    [*] --> CONFIRMED: Airbnb iCal import · manual confirmed booking

    INQUIRY --> PENDING: staff sends payment link
    INQUIRY --> CANCELLED: no response / declined

    PENDING --> CONFIRMED: payment webhook (deposit or full)
    PENDING --> CANCELLED: hold expires · guest abandons · staff cancels

    CONFIRMED --> CHECKED_IN: arrival recorded
    CONFIRMED --> CANCELLED: guest cancels (policy decides the refund)
    CONFIRMED --> NO_SHOW: check-in date passes with no arrival

    CHECKED_IN --> CHECKED_OUT: departure recorded
    CHECKED_OUT --> COMPLETED: review request sent, money settled

    CANCELLED --> [*]
    NO_SHOW --> [*]
    COMPLETED --> [*]
```

**Which states hold the calendar.** `PENDING`, `CONFIRMED`, `CHECKED_IN` and
`CHECKED_OUT` own a `CalendarSpan`. `INQUIRY` does not — an enquiry is not a
hold, and treating it as one is how a calendar fills up with dates nobody paid
for. `CANCELLED` and `NO_SHOW` release their span in the same transaction as
the status change, which is the moment the dates go back on sale.

**The hold clock.** A `PENDING` reservation carries `holdExpiresAt`, default 30
minutes (Settings). `POST /api/jobs/minute` cancels anything past it and deletes
the span. A guest who abandons the gateway therefore ties up the dates for half
an hour and no longer. The webhook is idempotent against this: a payment
arriving for an already-expired reservation re-checks availability, and either
revives it or refunds and tells the guest.

**Editing dates on a live reservation** is delete-span-then-insert-span inside
one transaction. If the new dates collide the transaction rolls back and the
reservation keeps the dates it had. There is no window in which it holds
neither.

## 5.2 Guest journey — the §8 chain, end to end

```mermaid
sequenceDiagram
    autonumber
    actor G as Guest
    participant W as Website
    participant API as Booking API
    participant DB as Postgres
    participant PM as PayMongo
    participant J as Cron
    participant S as Staff

    G->>W: dates + guests
    W->>API: GET /availability
    API->>DB: spans not overlapping range
    API-->>W: properties + from-price
    G->>W: pick property, add-ons, details
    W->>API: POST /quote (server prices it)
    API-->>W: itemised total
    G->>W: accept rules, pay
    W->>API: POST /booking
    rect rgb(240,248,255)
      API->>DB: BEGIN
      API->>DB: upsert Guest (email/mobile dedupe)
      API->>DB: insert Reservation (PENDING)
      API->>DB: insert CalendarSpan  ← exclusion constraint
      API->>DB: insert ReservationLines
      API->>DB: COMMIT
    end
    API->>PM: create checkout session
    API-->>G: redirect to gateway
    G->>PM: pays via GCash / card
    PM-->>API: webhook (signed)
    rect rgb(245,255,245)
      API->>DB: Payment PAID · Reservation CONFIRMED
      API->>DB: SecurityDeposit HELD
      API->>DB: schedule 8 messages
      API->>DB: create ARRIVAL_PREP task
      API->>DB: recompute guest tier + totals
    end
    API->>G: confirmation email
    J->>G: balance due · pre-arrival · check-in day
    S->>DB: mark CHECKED_IN
    API->>G: access instructions
    J->>G: post check-in · checkout reminder
    S->>DB: mark CHECKED_OUT
    rect rgb(255,250,240)
      API->>DB: create CleaningTask (deadline = next check-in)
      API->>DB: create Inspection task
      API->>DB: property readyState = CLEANING
    end
    S->>DB: checklist + photos → inspection PASSED
    API->>DB: restock → inventory movements · readyState = READY
    J->>G: review request (1 day after checkout)
    J->>DB: reservation COMPLETED · retention eligibility
```

Every arrow from `API` or `J` to `DB` is code, not a person. The only human
steps in the chain are the two check marks (arrived, departed), the cleaning
itself, and the inspection verdict — which is exactly the set of things a
person has to physically observe.

## 5.3 Payment

```mermaid
flowchart TD
    A[Reservation priced] --> B{Deposit policy}
    B -->|Full payment| C[Charge total]
    B -->|Down payment %| D[Charge deposit<br/>balance due N days before check-in]
    C --> E[PayMongo checkout session]
    D --> E
    E --> F{Webhook}
    F -->|checkout_session.payment.paid| G[Payment PAID]
    F -->|payment.failed| H[Payment FAILED<br/>reservation stays PENDING]
    F -->|nothing before holdExpiresAt| I[Cancel · release span]
    G --> J{paidCents >= total?}
    J -->|yes| K[paymentStatus = PAID]
    J -->|no| L[paymentStatus = PARTIALLY_PAID<br/>schedule balance-due email]
    K --> M[Reservation CONFIRMED]
    L --> M
    M --> N[Security deposit HELD]
    N --> O{At checkout}
    O -->|no damage| P[RETURNED — refund or release]
    O -->|damage logged| Q[Deduct → COLLECTED / PARTIALLY_RETURNED<br/>Incident links the amount]
```

Rules that are not obvious:

- **The client's price is never trusted.** `POST /booking` re-prices the stay
  server-side from the property, the date range, the add-ons and the promo code,
  and if the result differs from what the browser showed, the server's number
  wins and the guest sees it before paying.
- **Only the webhook confirms.** The browser returning from PayMongo renders a
  "we're confirming your payment" state that polls; it never writes status.
  Signature verification uses the HMAC in the `paymongo-signature` header and
  rejects anything older than five minutes.
- **Refunds are issued through PayMongo where a gateway payment exists**, and
  recorded as a negative `Payment` either way — a bank transfer refunded by hand
  still shows on the reservation's timeline.
- **PayMongo will not take less than ₱20 or refund less than ₱1.** Both floors
  are handled in `lib/payments`, not left to fail at the gateway.

## 5.4 Cleaning and turnover

```mermaid
flowchart TD
    CO[Reservation → CHECKED_OUT] --> CT[CleaningTask created<br/>deadline = next check-in, or +24h if none]
    CT --> BLK[CalendarBlock CLEANING<br/>only if no next check-in same day]
    CT --> PR[property.readyState = CLEANING]
    CT --> AS{Assigned?}
    AS -->|auto: single active cleaner| A1[status ASSIGNED]
    AS -->|no| A2[status PENDING → task board, unassigned]
    A1 --> IP[Cleaner opens on phone → IN_PROGRESS]
    A2 --> IP
    IP --> CL[Checklist by area<br/>photo required on flagged items]
    CL --> RS[Restock quantities → InventoryMovement USAGE]
    CL --> DM{Damage found?}
    DM -->|yes| INC[Incident created, linked to the departing reservation]
    DM -->|no| INS
    INC --> INS[status INSPECTION<br/>Inspection task created]
    INS --> V{Inspector verdict}
    V -->|Pass| RDY[readyState = READY<br/>cleaning block released]
    V -->|Needs attention| FIX[Re-open cleaning with notes<br/>back to IN_PROGRESS]
    V -->|Failed| ESC[Manager notified · maintenance ticket if structural]
    FIX --> CL
    ESC --> CL
    RDY --> DONE[Task DONE]
```

**The READY gate.** A property is bookable-as-ready only when it has no open
cleaning task and no inspection that is not `PASSED`. That predicate lives in
`isReady(propertyId)` and is what the dashboard's "unit not ready" flag and the
arrivals list both call. `readyState` on the property row is a cache of it,
refreshed by `syncReadyState()` at every transition; if the two ever disagree,
the predicate is right.

**Deadline and priority.** `nextCheckInAt` is the next confirmed arrival for
that property. The task's priority is derived: under 4 hours to the deadline is
`URGENT`, same day is `HIGH`, otherwise `MEDIUM`. A cleaner's board is sorted by
it, so the phone always shows the unit that matters most at the top.

## 5.5 Maintenance

```mermaid
stateDiagram-v2
    [*] --> REPORTED: staff · cleaner checklist · inspection fail · guest complaint
    REPORTED --> ASSIGNED: staff or vendor picked
    ASSIGNED --> IN_PROGRESS
    IN_PROGRESS --> WAITING_PARTS
    WAITING_PARTS --> IN_PROGRESS
    IN_PROGRESS --> COMPLETED: cost recorded → Expense
    REPORTED --> CANCELLED
    COMPLETED --> [*]

    note right of REPORTED
      Priority EMERGENCY may create a
      CalendarBlock immediately. That
      goes through the same exclusion
      constraint, so it cannot silently
      overwrite a booked stay — a
      conflict is reported, and the
      manager decides who moves.
    end note
```

An emergency block on dates that are already sold **fails loudly**. The system
will not quietly evict a paying guest; it tells the manager which reservation is
in the way and lets a person make that call.

## 5.6 Guest data lifecycle (PH Data Privacy Act)

```mermaid
flowchart LR
    C[Collected at booking:<br/>name · email · mobile · country] --> U[Used for: the stay,<br/>support, and legal records]
    U --> M{Marketing consent?}
    M -->|yes| MK[Campaigns · offers<br/>unsubscribe link on every send]
    M -->|no| NM[Transactional mail only]
    MK -->|unsubscribe| NM
    U --> R[Retained while a<br/>business record exists]
    R --> D[Erasure request:<br/>profile anonymised,<br/>reservation totals kept<br/>for the books]
```

Companions are recorded as names and a count, because a guest register is a
practical requirement. No ID numbers, no ID photographs, no passport scans, no
card data — none of it is needed to run the business, and all of it is a
liability to hold.
