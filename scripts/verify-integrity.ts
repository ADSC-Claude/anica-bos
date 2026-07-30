/**
 * Invariants that must hold for the books to be trustworthy. Run after seeding
 * in CI, and useful after a restore.
 *
 *   npx tsx scripts/verify-integrity.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Check = { name: string; run: () => Promise<{ ok: boolean; detail: string }> };

const checks: Check[] = [
  {
    name: 'every journal entry balances',
    run: async () => {
      const rows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM (
          SELECT "entryId" FROM "JournalLine"
          GROUP BY "entryId"
          HAVING sum("debitCents") <> sum("creditCents")
        ) unbalanced`;
      const count = Number(rows[0]?.count ?? 0);
      return { ok: count === 0, detail: `${count} unbalanced entr${count === 1 ? 'y' : 'ies'}` };
    },
  },
  {
    name: 'total debits equal total credits',
    run: async () => {
      const agg = await prisma.journalLine.aggregate({
        _sum: { debitCents: true, creditCents: true },
      });
      const d = agg._sum.debitCents ?? 0;
      const c = agg._sum.creditCents ?? 0;
      return { ok: d === c, detail: `debits ${d} vs credits ${c}` };
    },
  },
  {
    name: 'receipt numbers are unique',
    run: async () => {
      const total = await prisma.sale.count();
      const rows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(DISTINCT "receiptNo")::bigint AS count FROM "Sale"`;
      const distinct = Number(rows[0]?.count ?? 0);
      return { ok: total === distinct, detail: `${total} sales, ${distinct} distinct numbers` };
    },
  },
  {
    name: 'receipt sequences are gapless per series',
    run: async () => {
      const rows = await prisma.$queryRaw<{ seriesId: string; gaps: bigint }[]>`
        SELECT "seriesId", (max(sequence) - min(sequence) + 1 - count(*))::bigint AS gaps
        FROM "Sale" GROUP BY "seriesId"`;
      const bad = rows.filter((r) => Number(r.gaps) !== 0);
      return { ok: bad.length === 0, detail: bad.length ? `${bad.length} series with gaps` : 'no gaps' };
    },
  },
  {
    name: 'commissions are computed on the undiscounted list price',
    run: async () => {
      const rows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count
        FROM "Commission" c
        JOIN "SaleLine" l ON l.id = c."saleLineId"
        WHERE c."basisCents" <> l."basePriceCents" * l.quantity`;
      const count = Number(rows[0]?.count ?? 0);
      return { ok: count === 0, detail: `${count} mismatched commission basis` };
    },
  },
  {
    name: 'no item has negative stock',
    run: async () => {
      const count = await prisma.item.count({ where: { stockQty: { lt: 0 } } });
      return { ok: count === 0, detail: `${count} item(s) below zero` };
    },
  },
  {
    name: 'every sale is fully covered by its payments',
    run: async () => {
      const rows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM (
          SELECT s.id
          FROM "Sale" s
          LEFT JOIN "Payment" p ON p."saleId" = s.id
          WHERE s.status = 'PAID'
          GROUP BY s.id, s."totalCents"
          HAVING coalesce(sum(p."amountCents"), 0) < s."totalCents"
        ) short`;
      const count = Number(rows[0]?.count ?? 0);
      return { ok: count === 0, detail: `${count} under-paid sale(s)` };
    },
  },
  {
    name: 'no prepaid package is over-redeemed',
    run: async () => {
      const count = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "ClientPackageEntitlement"
        WHERE "usedSessions" > "totalSessions"`;
      const n = Number(count[0]?.count ?? 0);
      return { ok: n === 0, detail: `${n} over-redeemed entitlement(s)` };
    },
  },
  {
    name: 'no gift certificate has a negative balance',
    run: async () => {
      const count = await prisma.giftCertificate.count({ where: { balanceCents: { lt: 0 } } });
      return { ok: count === 0, detail: `${count} overdrawn certificate(s)` };
    },
  },
  {
    name: 'the demo database actually has data to show',
    run: async () => {
      const [sales, clients, appointments] = await Promise.all([
        prisma.sale.count(),
        prisma.client.count(),
        prisma.appointment.count(),
      ]);
      const ok = sales > 0 && clients > 0 && appointments > 0;
      return { ok, detail: `${sales} receipts, ${clients} clients, ${appointments} appointments` };
    },
  },
];

async function main() {
  let failed = 0;
  for (const check of checks) {
    const { ok, detail } = await check.run();
    console.log(`  ${ok ? '✓' : '✗'} ${check.name} — ${detail}`);
    if (!ok) failed += 1;
  }
  console.log(`\n${checks.length - failed}/${checks.length} invariants hold`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
