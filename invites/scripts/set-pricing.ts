/**
 * Sets the service-mode fees on every package, and the rush add-on, to one
 * agreed grid.
 *
 * The seed can only run against an empty database, and the admin table is
 * fifteen rows × two fields to retype by hand. This applies the grid below to
 * whatever rows exist — including occasions added after the seed — and touches
 * nothing else.
 *
 * The fees are FLAT across occasions, unlike `priceCents`, which the seed
 * scales per occasion. That is deliberate: the base price is a
 * willingness-to-pay decision and differs by occasion, while a DFY or
 * Concierge fee is recovering encoder hours, and encoding a debut costs what
 * encoding a wedding costs at the same tier.
 *
 * `priceCents` is never written here. Base prices stay whatever the admin has
 * set them to.
 *
 * Orders already placed are unaffected: an order snapshots its own
 * `subtotalCents`, `serviceFeeCents` and line items at checkout, so nothing
 * downstream re-reads a package to price a sale that already happened.
 *
 *   npm run db:pricing            # apply
 *   npm run db:pricing -- --dry   # show what would change
 */
import type { Tier } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { audit } from '../src/lib/audit';
import { formatPeso } from '../src/lib/money';

/**
 * Pesos, by tier. COMPLETE is the tier sold as "Signature" — the enum name
 * predates the label and is not worth a migration to rename.
 *
 * Assisted is sold on Signature alone, so the other two carry no fee for it.
 * Zero here is bookkeeping, not the gate: serviceModeAvailable in
 * src/lib/pricing.ts is what withdraws the mode, because a zero fee on its own
 * would render as "Included" and give the mode away instead.
 */
const FEES: Record<Tier, { dfy: number; assisted: number }> = {
  BASIC: { dfy: 500, assisted: 0 },
  STANDARD: { dfy: 1_200, assisted: 0 },
  COMPLETE: { dfy: 2_000, assisted: 2_000 },
};

/**
 * Rush is a queue jump on a Done-For-You job, priced against the DFY fee. It is
 * sold on Basic and Standard only (addOnAvailable), so this is a Standard-sized
 * jump, not a Signature-sized one.
 */
const RUSH_CODE = 'RUSH';
const RUSH_PRICE = 1_000;

const dry = process.argv.includes('--dry');
const pesos = (n: number) => Math.round(n * 100);
const col = (cents: number) => formatPeso(cents).padStart(11);

async function main() {
  const packages = await prisma.package.findMany({ orderBy: [{ occasion: 'asc' }, { sortOrder: 'asc' }] });
  if (packages.length === 0) throw new Error('No packages in the database. Run the seed first.');

  let changed = 0;
  console.info(`\n${'package'.padEnd(24)} ${'DFY'.padStart(11)} → ${'new'.padStart(11)}   ${'Assisted'.padStart(11)} → ${'new'.padStart(11)}`);

  for (const p of packages) {
    const target = FEES[p.tier];
    // A tier with no row in the grid would silently keep its old fees, which
    // is the one outcome worse than failing: the operator would read "done"
    // and price that tier wrong for months.
    if (!target) throw new Error(`No fees defined for tier ${p.tier} (package ${p.code}). Add it to FEES.`);

    const dfyFeeCents = pesos(target.dfy);
    const conciergeFeeCents = pesos(target.assisted);
    if (p.dfyFeeCents === dfyFeeCents && p.conciergeFeeCents === conciergeFeeCents) {
      console.info(`  ${p.code.padEnd(22)} ${col(p.dfyFeeCents)}   ${' '.repeat(11)}   ${col(p.conciergeFeeCents)}   ${' '.repeat(11)}  unchanged`);
      continue;
    }

    console.info(`  ${p.code.padEnd(22)} ${col(p.dfyFeeCents)} → ${col(dfyFeeCents)}   ${col(p.conciergeFeeCents)} → ${col(conciergeFeeCents)}`);
    if (!dry) {
      const before = { dfyFeeCents: p.dfyFeeCents, conciergeFeeCents: p.conciergeFeeCents };
      await prisma.package.update({ where: { id: p.id }, data: { dfyFeeCents, conciergeFeeCents } });
      // Price changes are `sensitive` wherever the admin makes them. A bulk
      // script that skipped the log would leave a gap in the only record of
      // who moved a price and when.
      await audit(null, {
        module: 'settings',
        action: 'package.update',
        entityType: 'Package',
        entityId: p.id,
        summary: `${p.code} service fees (set-pricing)`,
        before,
        after: { dfyFeeCents, conciergeFeeCents },
        sensitive: true,
      });
    }
    changed++;
  }

  const rush = await prisma.addOn.findUnique({ where: { code: RUSH_CODE } });
  const rushCents = pesos(RUSH_PRICE);
  if (!rush) {
    console.info(`\n  no ${RUSH_CODE} add-on — skipped.`);
  } else if (rush.priceCents === rushCents) {
    console.info(`\n  ${RUSH_CODE.padEnd(22)} ${col(rush.priceCents)}   unchanged`);
  } else {
    console.info(`\n  ${RUSH_CODE.padEnd(22)} ${col(rush.priceCents)} → ${col(rushCents)}`);
    if (!dry) {
      await prisma.addOn.update({ where: { id: rush.id }, data: { priceCents: rushCents } });
      await audit(null, {
        module: 'settings',
        action: 'addon.save',
        entityType: 'AddOn',
        entityId: rush.id,
        summary: `${RUSH_CODE} price (set-pricing)`,
        before: { priceCents: rush.priceCents },
        after: { priceCents: rushCents },
        sensitive: true,
      });
    }
    changed++;
  }

  console.info(`\n${dry ? 'Would change' : 'Changed'} ${changed} of ${packages.length + (rush ? 1 : 0)} rows.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
