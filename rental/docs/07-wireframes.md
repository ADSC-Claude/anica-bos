# 7 — Wireframes

Described, not drawn — a paragraph about what a screen is *for* survives a
redesign, and a picture of a button does not. Five screens carry the product.

Design direction, applied throughout:

- **Public** — premium, warm, relaxing, trustworthy. Generous whitespace, large
  photography, warm neutrals with one deep accent, a serif for headings and a
  clean sans for everything else. Hospitality, not SaaS. No stock-photo people,
  no gradient hero, no cookie banner theatre.
- **Portal** — fast, visual, obvious. Status is colour *and* a word, never
  colour alone. Minimum tap target 44px. A non-technical person on a phone with
  one hand full must be able to use it.

---

## 7.1 Landing page — `/`

```
┌──────────────────────────────────────────────────────────┐
│  ▲ brand              Stays   About   FAQ   Contact      │  transparent over hero,
├──────────────────────────────────────────────────────────┤  solid on scroll
│                                                          │
│        [ full-bleed photograph of the best unit ]        │
│                                                          │
│            Stay somewhere that feels like yours.         │  serif, 2 lines max
│         Condos in Metro Manila · A house in Bulacan      │
│                                                          │
│   ┌────────────────────────────────────────────────┐    │  ← ABOVE THE FOLD.
│   │ Check in │ Check out │ Guests │  Search stays  │    │    On mobile this is
│   └────────────────────────────────────────────────┘    │    a stacked card that
│                                                          │    overlaps the hero.
├──────────────────────────────────────────────────────────┤
│  Book direct and keep the difference                     │
│  ✓ Best rate, guaranteed   ✓ No platform fees            │  three short lines,
│  ✓ Talk to the owner, not a call centre                  │  no icons-as-decoration
├──────────────────────────────────────────────────────────┤
│  Our places                                              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │  photo     │ │  photo     │ │  photo     │           │
│  │ Name       │ │ Name       │ │ Name       │           │  from-price is real:
│  │ BGC · 4 pax│ │ QC · 2 pax │ │ Bulacan ·8 │           │  lowest available rate
│  │ from ₱3,500│ │ from ₱2,200│ │ from ₱6,000│           │  in the next 90 days
│  └────────────┘ └────────────┘ └────────────┘           │
├──────────────────────────────────────────────────────────┤
│  [ Promo strip — only renders when a promo is live ]     │
├──────────────────────────────────────────────────────────┤
│  What you get   wifi · aircon · kitchen · parking · …    │
├──────────────────────────────────────────────────────────┤
│  ★ 4.9 from 38 stays    “ two-line quote ”  — name       │
├──────────────────────────────────────────────────────────┤
│  Where we are   [ map ]   Minutes from …                 │
├──────────────────────────────────────────────────────────┤
│  Questions   4 FAQs, expandable → all FAQs               │
├──────────────────────────────────────────────────────────┤
│  Contact · socials · policies · © · built in Manila      │
└──────────────────────────────────────────────────────────┘
```

The test: a stranger who lands here on a phone knows **where it is, what makes
it nice, roughly what it costs, and how to book** within seconds, without
scrolling past the fold to find the date picker.

Server-rendered. `VacationRental` JSON-LD per property, OpenGraph on the page,
hero image preloaded and sized — Core Web Vitals are a booking-conversion
feature here, not a lint rule.

---

## 7.2 Property page — `/stays/[slug]`

```
┌──────────────────────────────────────────────────────────┐
│  ◀ All stays                                             │
│  Serenity Suite, BGC                        ★4.9 (21)    │
│  Condo · 4 guests · 1 bed · 1 bath · 32 sqm              │
├──────────────────────────────────────────────────────────┤
│  ┌──────────────────┬──────────┬──────────┐             │
│  │                  │          │          │  gallery:    │
│  │   cover photo    ├──────────┼──────────┤  tap = full  │
│  │                  │          │  +6 more │  screen swipe│
│  └──────────────────┴──────────┴──────────┘             │
├────────────────────────────────┬─────────────────────────┤
│ About this place               │ ┌─────────────────────┐ │
│ two paragraphs, editable       │ │ ₱3,500 / night      │ │ ← sticky on desktop,
│                                │ │                     │ │   bottom bar on mobile
│ Amenities        grouped grid  │ │ [ check in ][ out ] │ │
│ Sleeping         1 queen …     │ │ [ guests ▾ ]        │ │
│                                │ │                     │ │
│ Availability                   │ │ ₱3,500 × 3   10,500 │ │
│ ┌────────────────┐             │ │ Cleaning        800 │ │
│ │  Aug     Sep   │  live from  │ │ Early check-in  500 │ │
│ │  calendar grid │  the master │ │ Promo −10%   −1,050 │ │
│ │  ✕ = taken     │  calendar   │ │ ─────────────────── │ │
│ └────────────────┘             │ │ Total       ₱10,750 │ │
│                                │ │ Due now (30%) 3,225 │ │
│ House rules      check-in 3pm  │ │                     │ │
│ Getting there    transport     │ │ [    Book now    ]  │ │
│ Nearby           5 places      │ │ Best rate direct.   │ │
│ Cancellation     plain English │ └─────────────────────┘ │
│ Reviews          rating + list │                         │
└────────────────────────────────┴─────────────────────────┘
```

The price card totals **before** the guest commits to anything. Nothing appears
at the payment step that was not visible here — the single most common reason a
direct booking is abandoned is a number that grew.

Availability comes from the master calendar on every request. There is no
nightly export, no cache with a TTL, and therefore no window in which the site
sells a night that Airbnb already sold.

---

## 7.3 Booking flow — `/book`

Four steps, one screen each on mobile, a progress rail on desktop. The guest can
go back without losing anything; the quote is re-priced server-side at every
forward step.

```
STEP 1  Dates & guests          STEP 2  Your stay
┌──────────────────────┐        ┌──────────────────────────┐
│ Check in   Check out │        │ [photo] Serenity Suite   │
│ [ 12 Aug ][ 15 Aug ] │        │ 12–15 Aug · 3 nights · 2 │
│ Guests  [ 2 adults ] │        │                          │
│         [ 0 children]│        │ Add to your stay         │
│                      │        │ ☐ Early check-in   ₱500  │
│ Available (2)        │        │ ☐ Extra bedding    ₱350  │
│ ▸ Serenity  ₱10,500  │        │ ☐ Airport pickup ₱1,200  │
│ ▸ Casa Bulacan 18,000│        │                          │
│ ▸ Solaire  — 13–14 ✕ │        │ Promo code [        ][→] │
│   (shown, disabled,  │        │                          │
│    with the reason)  │        │ ₱3,500 × 3      10,500   │
└──────────────────────┘        │ Cleaning           800   │
                                │ Early check-in     500   │
STEP 3  Your details            │ Promo SUMMER10  −1,050   │
┌──────────────────────┐        │ ══════════════════════   │
│ Name  [           ]  │        │ Total          ₱10,750   │
│ Email [           ]  │        │ Pay now (30%)   ₱3,225   │
│ Mobile[+63        ]  │        │ Balance 5 Aug   ₱7,525   │
│ Country [PH      ▾]  │        │              [ Continue ]│
│                      │        └──────────────────────────┘
│ Requests [        ]  │
│                      │        STEP 4  Payment
│ ☐ I accept the house │        ┌──────────────────────────┐
│   rules and the      │        │ Held for you: 29:41 ⏱    │
│   cancellation policy│        │ GCash · Maya · Card · OB │
│ ☐ Send me offers     │        │      [ Pay ₱3,225 ]      │
│   (optional)         │        │ Secured by PayMongo.     │
│         [ Continue ] │        │ We never see your card.  │
└──────────────────────┘        └──────────────────────────┘
```

The countdown on step 4 is the real `holdExpiresAt`, not decoration. When it
runs out the dates genuinely go back on sale.

Confirmation shows the reference in large type, the full breakdown, what happens
next, and what is still owed — the same content as the email, because a guest
who screenshots the screen should be holding everything they need.

---

## 7.4 Owner dashboard — `/portal`

```
┌───────────────────────────────────────────────────────────────┐
│ ◧ Dashboard   [All properties ▾] [All branches ▾] [Aug 2026 ▾]│
├───────────────────────────────────────────────────────────────┤
│ ⚠ 2 things need you                                           │  only when non-empty
│   ▸ Casa Bulacan not ready — guest arrives in 4 hours    →     │  urgent = red rule
│   ▸ Aircon repair (Emergency) open since Tuesday         →     │
├───────────────────────────────────────────────────────────────┤
│ TODAY                                                          │
│ ┌────────┬────────┬────────┬────────┬────────┐                │
│ │Arrivals│Departs │In house│ Ready  │Cleaning│                │
│ │   2    │   1    │   4    │  2/3   │   1    │                │
│ └────────┴────────┴────────┴────────┴────────┘                │
│ Arrivals   3:00pm  Serenity   Maria Santos   ✓ ready   paid    │
│            6:00pm  Solaire    Jun Cruz       ⚠ cleaning ₱2,400 │
├───────────────────────────────────────────────────────────────┤
│ THIS MONTH                        vs target                    │
│ Gross revenue   ₱248,500  ▲12%    ████████░░  target 280,000   │
│ Expenses         ₱71,200          Net ₱177,300                 │
│ ┌───────────┬───────────┬───────────┬───────────┐             │
│ │ ADR       │ Occupancy │ RevPAR    │ Avg stay  │             │
│ │ ₱4,140    │   68%     │ ₱2,815    │ 2.8 nights│             │
│ └───────────┴───────────┴───────────┴───────────┘             │
│ Where bookings came from  ▓▓▓▓▓▓ Direct 46%  ▓▓▓▓ Airbnb 38%  │
│                           ▓▓ Referral 16%                      │
├───────────────────────────────────────────────────────────────┤
│ Per property     Nights  Occ   ADR    Revenue  Expenses   Net  │
│ Serenity Suite      21   68%  4,200   88,200    19,400  68,800 │
│ Solaire Studio      18   58%  3,100   55,800    14,100  41,700 │
│ Casa Bulacan        14   45%  7,460  104,500    37,700  66,800 │
├───────────────────────────────────────────────────────────────┤
│ Needs attention   ▸ 1 unpaid balance ₱7,525 (due in 2 days)    │
│                   ▸ 3 items low on stock                       │
│                   ▸ Barangay permit expires in 24 days         │
└───────────────────────────────────────────────────────────────┘
```

Every number is a link to the rows behind it. Every KPI shows its formula on
hover, because an owner who does not trust a number will go back to the
spreadsheet. Bars are CSS, not a chart library.

---

## 7.5 Cleaner's phone — `/portal/tasks`

The screen that decides whether this system is used or abandoned. One thumb, one
column, no sidebar, no menu.

```
┌────────────────────────┐   ┌────────────────────────┐
│ Today · Mon 12 Aug     │   │ ◀  Casa Bulacan        │
│ Ana R.            [⋯]  │   │ Clean by 2:00 PM       │
├────────────────────────┤   │ ⏱ 3h 40m left          │
│ ┏━━━━━━━━━━━━━━━━━━━━┓ │   ├────────────────────────┤
│ ┃ URGENT   2h left   ┃ │   │ BEDROOMS         0/4   │
│ ┃ Casa Bulacan       ┃ │   │ ☐ Strip and remake beds│
│ ┃ Out 11:00 · In 2PM ┃ │   │ ☐ Fresh linen      📷  │  📷 = photo required,
│ ┃ Sta. Maria         ┃ │   │ ☐ Wipe surfaces        │       greys out the
│ ┃ [    Start    ]    ┃ │   │ ☐ Vacuum / mop         │       Done button until
│ ┗━━━━━━━━━━━━━━━━━━━━┛ │   ├────────────────────────┤       taken
│ ┌────────────────────┐ │   │ BATHROOM         2/5 ✓ │
│ │ TODAY   6h left    │ │   │ ☑ Toilet           📷  │
│ │ Serenity Suite     │ │   │ ☑ Shower and tiles     │
│ │ Out 12:00 · In 3PM │ │   │ ☐ Restock toiletries   │
│ │ BGC                │ │   │    [− 2 +] rolls       │  restock quantity
│ │ [    Start    ]    │ │   │ ☐ Fresh towels     📷  │  deducts stock
│ └────────────────────┘ │   ├────────────────────────┤
│                        │   │ ANYTHING BROKEN?       │
│ Done today (1)       ▾ │   │ [ + Report damage ]    │  → Incident + photo
└────────────────────────┘   ├────────────────────────┤
                             │ 11 of 24 done          │
                             │ [ Send for inspection ]│  disabled until every
                             └────────────────────────┘  mandatory item + photo
```

Decisions that make it usable in the field:

- **Photo capture is `<input capture="environment">`** — the phone camera opens
  directly, no gallery, no upload dialogue.
- **Progress is saved per item as it is ticked**, not on a final submit. A
  dropped signal in a Bulacan stairwell must not cost forty minutes of work.
- **The deadline is a countdown, not a timestamp.** "3h 40m left" is actionable;
  "due 14:00" requires arithmetic while holding a mop.
- **No prices, no guest surnames, no other properties.** The scope gate in
  document 3 is visible on screen, which is how a cleaner can be trusted with a
  login at all.
- **Offline-tolerant**: the checklist is a PWA route with a service worker, ticks
  queue locally and flush when signal returns.
