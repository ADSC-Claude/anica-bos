# 3 — Roles and permissions

Seven roles. Least privilege, enforced **server-side on every page, every server
action and every endpoint**. The single source of truth is `src/lib/rbac.ts`;
the navigation and the buttons only hide what the server already refuses, and
`tests/live/rbac-live.ts` proves that over real HTTP by calling the endpoints
directly with each role's cookie.

## Two independent gates

A permission answers *what kind of thing may you do*. It does not answer *whose
record is it*. Both are checked, in this order:

1. **Permission gate** — `can(role, permission)`.
2. **Scope gate** — `visibleProperties(user)` and, for the three field roles,
   `assigneeId = user.id`.

A cleaner holds `tasks.complete`. That is not permission to complete *any*
task; the scope gate reduces the set to tasks assigned to them. Skipping gate 2
is the classic multi-tenant hole, so it lives in one helper
(`scopeToAssignee`) that every task query passes through.

### Property scope by role

| Role | Sees |
|---|---|
| Owner / Super Admin | every property, every branch |
| Property Manager | properties in `UserProperty` |
| Reservations | properties in `UserProperty`, or all if none assigned |
| Accountant | every property, read-only outside finance |
| Cleaner / Inspector / Maintenance | only properties reachable through a task assigned to them |

## The matrix

`✓` granted · `R` read-only · `—` refused

| Permission | Owner | Manager | Reservations | Accountant | Cleaner | Inspector | Maintenance |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `dashboard.view` | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `dashboard.financials` | ✓ | ✓ | — | ✓ | — | — | — |
| `properties.view` | ✓ | ✓ | ✓ | R | — | — | — |
| `properties.edit` | ✓ | ✓ | — | — | — | — | — |
| `properties.create` | ✓ | — | — | — | — | — | — |
| `calendar.view` | ✓ | ✓ | ✓ | — | — | — | — |
| `calendar.block` | ✓ | ✓ | ✓ | — | — | — | — |
| `reservations.view` | ✓ | ✓ | ✓ | R | — | — | — |
| `reservations.edit` | ✓ | ✓ | ✓ | — | — | — | — |
| `reservations.cancel` | ✓ | ✓ | ✓ | — | — | — | — |
| `reservations.checkin` | ✓ | ✓ | ✓ | — | — | — | — |
| `guests.view` | ✓ | ✓ | ✓ | — | — | — | — |
| `guests.edit` | ✓ | ✓ | ✓ | — | — | — | — |
| `guests.merge` | ✓ | ✓ | — | — | — | — | — |
| `messages.send` | ✓ | ✓ | ✓ | — | — | — | — |
| `tasks.view` | ✓ | ✓ | — | R | own | own | own |
| `tasks.assign` | ✓ | ✓ | — | — | — | — | — |
| `tasks.complete` | ✓ | ✓ | — | — | own | own | own |
| `cleaning.view` | ✓ | ✓ | R | R | own | own | — |
| `cleaning.manage` | ✓ | ✓ | — | — | — | — | — |
| `inspection.perform` | ✓ | ✓ | — | — | — | ✓ | — |
| `maintenance.view` | ✓ | ✓ | R | R | — | — | own |
| `maintenance.edit` | ✓ | ✓ | — | — | — | — | own |
| `maintenance.cost` | ✓ | ✓ | — | R | — | — | — |
| `incidents.view` | ✓ | ✓ | ✓ | R | — | — | — |
| `incidents.edit` | ✓ | ✓ | ✓ | — | — | — | — |
| `inventory.view` | ✓ | ✓ | — | R | R | — | — |
| `inventory.edit` | ✓ | ✓ | — | — | — | — | — |
| `inventory.consume` | ✓ | ✓ | — | — | ✓ | — | ✓ |
| `finance.view` | ✓ | ✓ | — | ✓ | — | — | — |
| `finance.submitExpense` | ✓ | ✓ | — | ✓ | — | — | — |
| `finance.edit` | ✓ | — | — | ✓ | — | — | — |
| `finance.refund` | ✓ | ✓ | — | — | — | — | — |
| `finance.export` | ✓ | ✓ | — | ✓ | — | — | — |
| `reports.view` | ✓ | ✓ | — | ✓ | — | — | — |
| `reviews.view` | ✓ | ✓ | ✓ | — | — | — | — |
| `reviews.respond` | ✓ | ✓ | — | — | — | — | — |
| `marketing.view` | ✓ | ✓ | ✓ | — | — | — | — |
| `marketing.edit` | ✓ | ✓ | — | — | — | — | — |
| `documents.view` | ✓ | ✓ | — | ✓ | — | — | — |
| `documents.edit` | ✓ | ✓ | — | ✓ | — | — | — |
| `settings.view` | ✓ | ✓ | — | — | — | — | — |
| `settings.edit` | ✓ | ✓ | — | — | — | — | — |
| `settings.critical` | ✓ | — | — | — | — | — | — |
| `users.manage` | ✓ | — | — | — | — | — | — |
| `branches.manage` | ✓ | — | — | — | — | — | — |
| `audit.view` | ✓ | — | — | — | — | — | — |
| `sync.manage` | ✓ | ✓ | — | — | — | — | — |

## Decisions behind the awkward cells

**Reservations staff cannot see money beyond a booking's own balance.** They
need to tell a guest what is owed; they do not need the P&L. `finance.view` is
withheld and `dashboard.financials` with it, so the dashboard renders for them
with occupancy and arrivals but no revenue tiles.

**Accountants are read-only everywhere outside finance.** They can open a
reservation to see what a payment was for, and cannot change its dates.

**A manager cannot create or delete properties, or manage users.** Adding a
property is a business decision with a public page and a payment configuration
attached; it stays with the owner. Editing an existing one is daily work.

**Only the owner reads the audit log.** It contains before/after values of
everything, including other people's mistakes.

**Maintenance may edit their own tickets but not see costs across the
portfolio.** They record what a repair cost; they do not get the maintenance
spend report.

**Cleaners have `inventory.consume` but not `inventory.view`.** Finishing a
checklist records what was restocked, which deducts stock. That is a write
through a form they already hold, not a licence to browse the stockroom.

## What a cleaner literally sees

Sign in on a phone → `/portal/tasks`, filtered to today and to them. Each card:
property, address, checkout time, **next check-in time**, and a colour that goes
red as the deadline approaches. Tapping opens the checklist. There is no
sidebar, no property list, no calendar, no guest names beyond the first name on
the arriving booking. Requesting `/portal/finance` by URL returns a redirect;
requesting `/api/portal/export/pl` returns `403` with the role named.

## Enforcement checklist for every new route

1. `requirePage(permission)` or `requireApi(permission)` on the first line.
2. Scope the query with `visibleProperties(user)` — never `findMany()` bare.
3. For field roles, `scopeToAssignee(user, query)`.
4. Mutations call `audit()` with before/after.
5. Add the route to `tests/live/rbac-live.ts` with the roles that must get `403`.
