# Finance and BIR reference

How money actually moves through this system: which accounts each transaction
touches, how receipt numbers are issued, and what the tax settings change.

Everything below is read out of the posting code rather than described from
intent — `src/lib/accounting.ts`, `src/lib/pos.ts`,
`src/app/portal/finance/actions.ts` and `src/app/portal/inventory/actions.ts`.
If the code changes and this file does not, the code is right.

The last section, [What does not post](#what-does-not-post), lists the accounts
that exist in the chart but that nothing writes to. Read it before relying on a
report to be complete.

---

## The chart of accounts

Twenty-four accounts, defined in `ACCOUNTS` in `src/lib/accounting.ts` and
created by `ensureAccounts()`. Deliberately small: every sale and expense posts
a balanced double-entry journal, which is what makes the BIR-format journals
real reports rather than reformatted transaction lists.

| Code | Account | Type |
|---|---|---|
| 1000 | Cash on Hand | Asset |
| 1010 | Cash in Bank / E-Wallet | Asset |
| 1020 | Petty Cash Fund | Asset |
| 1100 | Accounts Receivable — Corporate | Asset |
| 1200 | Inventory — Supplies & Retail | Asset |
| 2000 | Accounts Payable | Liability |
| 2100 | Unearned Revenue — Reservation Deposits | Liability |
| 2110 | Gift Certificate Liability | Liability |
| 2120 | Unearned Revenue — Prepaid Packages | Liability |
| 2200 | Output VAT Payable | Liability |
| 2300 | Tips Payable | Liability |
| 3000 | Owner's Equity | Equity |
| 4000 | Service Revenue | Income |
| 4100 | Retail Product Sales | Income |
| 4200 | Package & Membership Revenue | Income |
| 4900 | Sales Discounts (contra) | Income |
| 5000 | Cost of Goods Sold | Expense |
| 6000 | Salaries & Wages | Expense |
| 6010 | Therapist Commissions | Expense |
| 6100 | Rent | Expense |
| 6110 | Utilities | Expense |
| 6120 | Supplies | Expense |
| 6130 | Marketing | Expense |
| 6900 | Miscellaneous Expense | Expense |

## The four journals

Every entry is tagged with a `JournalSource`, which is what lets the reports be
produced in the BIR's four book formats:

| Source | Holds |
|---|---|
| `SALES` | POS sales — one entry per receipt |
| `CASH_RECEIPTS` | Money in that is not a sale, e.g. a corporate account settling its statement |
| `CASH_DISBURSEMENTS` | Expenses and purchase orders |
| `GENERAL` | Cost of goods sold, stock write-offs, adjustments |

## How a payment method picks its account

`PAYMENT_ACCOUNT` in `src/lib/accounting.ts` maps each tender to the account
debited:

| Payment method | Debits |
|---|---|
| Cash | 1000 Cash on Hand |
| GCash | 1010 Cash in Bank / E-Wallet |
| Bank transfer | 1010 Cash in Bank / E-Wallet |
| Corporate charge | 1100 Accounts Receivable — Corporate |
| Gift certificate | 2110 Gift Certificate Liability |
| Deposit credit | 2100 Unearned Revenue — Reservation Deposits |
| Loyalty points | 4900 Sales Discounts (contra) |

Cash is debited **net of change given**, so the entry reflects what stayed in
the drawer rather than what was handed over.

## How a sale posts

One entry per receipt, in the `SALES` journal, referenced by the receipt
number. Its shape:

```
DEBIT   payment account(s)        what was actually received
DEBIT   4900 Sales Discounts      any discount given
  CREDIT  4000 Service Revenue      services, prepaid redemptions, perks
  CREDIT  4100 Retail Product Sales products
  CREDIT  4200 Package & Membership packages and gift certificates sold
  CREDIT  2200 Output VAT Payable   only when VAT-registered
  CREDIT  2300 Tips Payable         any tip
```

Two design points worth understanding:

- **Revenue is credited gross of discount.** The discount is carried as a debit
  to the contra account 4900 rather than netted out of revenue, so the books
  show both what was charged and what was given away.
- **Revenue is credited net of VAT.** The VAT is split across the revenue
  accounts in proportion to each one's share of the subtotal, and the remainder
  is credited to 2200.

### Worked example: a straightforward cash sale

Swedish Massage at ₱700, customer pays ₱1,000 cash, ₱300 change. Non-VAT.

| Account | Debit | Credit |
|---|---|---|
| 1000 Cash on Hand | 700.00 | |
| 4000 Service Revenue | | 700.00 |

The ₱1,000 handed over never appears — cash is debited net of the ₱300 change.

### Worked example: a discount

Service listed at ₱1,000, ₱100 discount applied, customer pays ₱900 cash.

| Account | Debit | Credit |
|---|---|---|
| 1000 Cash on Hand | 900.00 | |
| 4900 Sales Discounts (contra) | 100.00 | |
| 4000 Service Revenue | | 1,000.00 |

Revenue still reads ₱1,000. The giveaway is visible on its own line, which is
what makes discount reporting possible.

### Worked example: a retail product with stock cost

Product sold at ₱500 that cost ₱200. This posts **two** entries.

`SI-00000n` in `SALES`:

| Account | Debit | Credit |
|---|---|---|
| 1000 Cash on Hand | 500.00 | |
| 4100 Retail Product Sales | | 500.00 |

`SI-00000n-COGS` in `GENERAL`:

| Account | Debit | Credit |
|---|---|---|
| 5000 Cost of Goods Sold | 200.00 | |
| 1200 Inventory — Supplies & Retail | | 200.00 |

The same second entry covers consumables drawn down by a service's recipe, not
just retail products.

## Receipt numbering

Receipt numbers come from a `ReceiptSeries` row, which carries the BIR
Authority to Print details.

- Format is `PREFIX-NNNNNN`, zero-padded to six digits — `SI-000001`.
- The number is taken from `series.next`, which is incremented inside the same
  database transaction as the sale, so two tills cannot take the same number.
- When `next` passes `rangeEnd`, checkout **refuses** with "The BIR receipt
  series for this branch is exhausted. Register a new series in Settings."
  rather than issuing a number outside the registered range.
- `permitNumber` on the series holds the ATP. It ships as the placeholder
  `FP000000000000000 (sample — replace with your BIR ATP)` and must be replaced
  with the real one.

**Numbers are never reused and receipts are never deleted.** A voided sale keeps
its number and its receipt — see [Voids](#voids). This is deliberate: a gapless
series with a hole in it reads to an examiner as a hidden transaction, not as a
corrected mistake.

## Tax regimes

Set in Settings → Tax. `tax.regime` is one of:

### `NON_VAT_8` — the current setting

The 8% gross receipts option for small businesses. No VAT is computed and **no
2200 line is posted**; `vatableSalesCents`, `vatExemptSalesCents` and
`vatAmountCents` are all stored as zero on the sale. The 8% is a matter for the
income tax return, not for each receipt, so nothing is withheld at the till.

### `VAT_REGISTERED`

Philippine prices are quoted VAT-inclusive, so VAT is **backed out** of the net
rather than added on top:

```
vat = net − net / (1 + vatPercent/100)
```

At the default 12%, a ₱1,120 net contains ₱120 of VAT and ₱1,000 of vatable
sales. The ₱120 is credited to 2200 and the revenue accounts are credited with
the remainder.

**PWD and Senior Citizen discounts make the whole sale VAT-exempt.** If any
applied discount carries an ID number, the entire net is treated as exempt and
no VAT is computed on that sale. This is why the discount button for PWD and
Senior prompts for an ID number, and why those discounts are configured as
non-stackable.

## Voids

A void never deletes anything. For each journal entry the sale produced, a
mirror entry is posted with debits and credits swapped, referenced
`ORIGINAL-VOID`, dated to the **original sale's business date** so the reversal
lands in the same period as the sale.

Voiding a ₱700 cash sale:

| Account | Debit | Credit |
|---|---|---|
| 4000 Service Revenue | 700.00 | |
| 1000 Cash on Hand | | 700.00 |

The original receipt, its number, and its original entry all remain. Alongside
the reversal, a void also cancels any gift certificates sold on that sale,
restores redeemed package sessions, and reverses loyalty points.

A void requires the **Owner's approval PIN** — see the note in the README.

## Expenses

Recorded against an `ExpenseCategory`, which carries the account code to debit.
Posted to `CASH_DISBURSEMENTS`, referenced `EXP-xxxxxx`.

| Category | Debits |
|---|---|
| Rent | 6100 |
| Utilities | 6110 |
| Supplies | 6120 |
| Marketing | 6130 |
| Salaries & Wages | 6000 |
| Miscellaneous | 6900 |
| Inventory Purchases | 1200 *(capitalised — an asset, not an expense)* |

The credit side follows how it was paid: cash credits 1000, a corporate charge
credits 2000 Accounts Payable, anything else credits 1010.

`Inventory Purchases` is flagged **capitalised** because buying stock is not
spending money, it is converting cash into an asset. The cost becomes an expense
later, through the COGS entry, when the item is actually sold or consumed.

## Corporate accounts

A corporate charge at checkout debits 1100 Accounts Receivable rather than a
cash account — the treatment is sold but not yet paid for.

When the account later settles, a `CASH_RECEIPTS` entry referenced `AR-…`
posts:

| Account | Debit | Credit |
|---|---|---|
| 1000 or 1010 | amount | |
| 1100 Accounts Receivable — Corporate | | amount |

## What does not post

These accounts exist in the chart but **nothing currently writes to them**. Each
is a real limit on what the finance reports can tell you today.

| Account | Situation |
|---|---|
| **6010 Therapist Commissions** | Commissions are calculated and stored per sale line in the `Commission` table, and drive payroll — but **no journal entry is posted**. Commission expense therefore does not appear in the ledger or the P&L on its own. |
| **6000 Salaries & Wages** | Only reached by recording an expense under the "Salaries & Wages" category. Running payroll does not post a journal entry by itself. |
| **2100 Unearned Revenue — Deposits** | Only ever **debited**, when a booking deposit is applied at checkout. Taking the deposit does not credit it, so the liability is never raised when the money arrives. |
| **2110 Gift Certificate Liability** | Only ever **debited**, on redemption. Selling a gift certificate credits 4200 Package & Membership Revenue, so a GC is recognised as revenue when sold rather than held as a liability until used. |
| **2120 Unearned Revenue — Prepaid Packages** | Never posted. Prepaid packages are recognised as revenue at the point of sale, the same way. |
| **2300 Tips Payable** | Credited on every sale carrying a tip, but nothing ever debits it. The balance grows and is never cleared by paying tips out. |
| **3000 Owner's Equity** | Never posted. There is no capital-contribution or drawings entry. |

None of these stop the books balancing — every entry that *is* posted is
balanced. They mean certain balances are incomplete, so treat 2100, 2110, 2120
and 2300 as indicative rather than as true liability balances, and get
commission and payroll expense from the payroll reports rather than the ledger.

## What the system guarantees

`postJournal` refuses to write an unbalanced entry — if debits and credits
disagree it throws, and the surrounding database transaction rolls back. A
half-posted sale is therefore not a state the system can reach.

`npx tsx scripts/verify-integrity.ts` checks these invariants against the live
database:

1. Every journal entry balances
2. Total debits equal total credits
3. Receipt numbers are unique
4. Receipt sequences are gapless per series
5. Commissions are computed on the undiscounted list price
6. No item has negative stock
7. Every sale is fully covered by its payments
8. No prepaid package is over-redeemed
9. No gift certificate has a negative balance

Worth running before any filing period.

## Before filing

- Replace the ATP placeholder on the receipt series with the real permit number.
- Confirm `tax.regime` matches your registration, and the TIN in Settings.
- Run `verify-integrity.ts` and resolve anything it reports.
- Remember that commission and payroll expense are **not** in the ledger — take
  them from the payroll reports when preparing the income statement.
