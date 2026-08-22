# Design artifacts

Written before the feature code, and kept true to it afterwards. If a document
here and the code disagree, the document is the bug — fix it in the same commit
as the code that broke it.

| # | Document | Answers |
|---|---|---|
| 1 | [Architecture](./01-architecture.md) | What runs where, and which module may call which |
| 2 | [Sitemap](./02-sitemap.md) | Every public and portal route |
| 3 | [Roles and permissions](./03-roles-and-permissions.md) | Who may do what, and where that is enforced |
| 4 | [Data model](./04-data-model.md) | Every table, every relation, and why double booking is impossible |
| 5 | [Workflows](./05-workflows.md) | Reservation, guest journey, payment, turnover, maintenance |
| 6 | [Automation map](./06-automation-map.md) | Trigger → action → recipient, for every automation |
| 7 | [Wireframes](./07-wireframes.md) | Landing, property page, booking flow, dashboard, cleaner phone |
| 8 | [Integrations](./08-integrations.md) | PayMongo, email, iCal now; channel manager, locks, SMS later |
| 9 | [Security and backup](./09-security-and-backup.md) | Threat model, data privacy, restore procedure |
| 10 | [Function classification](./10-function-classification.md) | Native / Integrated / Automated / Future Phase |

Two conventions run through all of them:

- **Money is an integer number of centavos.** ₱1,234.50 is `123450`. No floats
  anywhere near a peso.
- **Time is stored UTC, reasoned about in Asia/Manila.** The Philippines has
  been a fixed UTC+08:00 since 1978, so the offset is a constant, not a
  library. A *stay date* is a calendar date with no time attached.
