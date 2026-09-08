/**
 * Sets the price, fees and revision count on every package, and the queue-jump
 * add-ons, to one
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
 * conciergeFeeCents is zero on every tier. The mode it priced is withdrawn —
 * speed is bought as the rush or priority add-on instead — and the column stays
 * only so orders sold under that mode still reconcile.
 */
const FEES: Record<Tier, { base: number; dfy: number; concierge: number; revisions: number }> = {
  BASIC: { base: 2_000, dfy: 500, concierge: 0, revisions: 2 },
  STANDARD: { base: 3_000, dfy: 1_200, concierge: 0, revisions: 4 },
  COMPLETE: { base: 4_000, dfy: 2_000, concierge: 0, revisions: 6 },
};

/**
 * Revisions are counted after publish and cover the photos and the details.
 * The design is not among them — changeTemplate refuses once an invitation is
 * published — so there is no longer anything for the template-switch add-on to
 * sell, and it is deactivated rather than deleted: orders that bought one keep
 * their line item.
 */
const RETIRED_ADDONS = ['TEMPLATE_SWITCH'];

/**
 * The queue jumps, in pesos. Rush is Basic's and Standard's and promises 24
 * hours; priority is Signature's and promises two working days, because that
 * build carries too much to encode overnight. addOnAvailable in
 * src/lib/pricing.ts decides which tier is offered which; addOnPrice charges
 * rush 1,500 on Standard, which is the one price not held on its own row.
 */
const ADDONS: { code: string; price: number; name: string; description: string; sortOrder: number }[] = [
  {
    code: 'RUSH',
    price: 1_000,
    name: 'Rush publish (24 hours)',
    description: 'Your Done-For-You build jumps the queue and is published within 24 hours instead of the usual five days to a week. Fewer revision rounds come with it: there is limited time to encode, so there is minimal chance to revise. Basic and Standard.',
    sortOrder: 5,
  },
  {
    code: 'PRIORITY',
    price: 2_000,
    name: 'Priority (2 working days)',
    description: 'Your Done-For-You build is finished in two working days instead of the usual five to a week. Fewer revision rounds come with it: there is limited time to encode, so there is minimal chance to revise. Signature only.',
    sortOrder: 6,
  },
  {
    code: 'SAVE_THE_DATE',
    price: 299,
    name: 'Save the Date card',
    description: 'A second card on the same design, with its own link, for sending months ahead. Your names, your date and your cover photo — the venue, the programme and the RSVP wait for the invitation itself. It publishes on its own, so announcing early does not spend the revisions on your invitation.',
    sortOrder: 2,
  },
];

const dry = process.argv.includes('--dry');
const pesos = (n: number) => Math.round(n * 100);
const col = (cents: number) => formatPeso(cents).padStart(11);

async function main() {
  const packages = await prisma.package.findMany({ orderBy: [{ occasion: 'asc' }, { sortOrder: 'asc' }] });
  if (packages.length === 0) throw new Error('No packages in the database. Run the seed first.');

  let changed = 0;
  console.info(`\n${'package'.padEnd(24)} ${'DFY'.padStart(11)} → ${'new'.padStart(11)}   ${'Priority'.padStart(11)} → ${'new'.padStart(11)}`);

  for (const p of packages) {
    const target = FEES[p.tier];
    // A tier with no row in the grid would silently keep its old fees, which
    // is the one outcome worse than failing: the operator would read "done"
    // and price that tier wrong for months.
    if (!target) throw new Error(`No fees defined for tier ${p.tier} (package ${p.code}). Add it to FEES.`);

    const priceCents = pesos(target.base);
    const dfyFeeCents = pesos(target.dfy);
    const conciergeFeeCents = pesos(target.concierge);
    const editsAfterPublish = target.revisions;
    if (p.priceCents === priceCents && p.dfyFeeCents === dfyFeeCents && p.conciergeFeeCents === conciergeFeeCents && p.editsAfterPublish === editsAfterPublish) {
      console.info(`  ${p.code.padEnd(22)} ${col(p.priceCents)}   unchanged`);
      continue;
    }

    console.info(`  ${p.code.padEnd(22)} base ${col(p.priceCents)} → ${col(priceCents)}   DFY ${col(p.dfyFeeCents)} → ${col(dfyFeeCents)}   rev ${String(p.editsAfterPublish).padStart(3)} → ${String(editsAfterPublish).padStart(2)}`);
    if (!dry) {
      const before = { priceCents: p.priceCents, dfyFeeCents: p.dfyFeeCents, conciergeFeeCents: p.conciergeFeeCents, editsAfterPublish: p.editsAfterPublish };
      await prisma.package.update({ where: { id: p.id }, data: { priceCents, dfyFeeCents, conciergeFeeCents, editsAfterPublish } });
      // Price changes are `sensitive` wherever the admin makes them. A bulk
      // script that skipped the log would leave a gap in the only record of
      // who moved a price and when.
      await audit(null, {
        module: 'settings',
        action: 'package.update',
        entityType: 'Package',
        entityId: p.id,
        summary: `${p.code} price and fees (set-pricing)`,
        before,
        after: { priceCents, dfyFeeCents, conciergeFeeCents, editsAfterPublish },
        sensitive: true,
      });
    }
    changed++;
  }

  for (const spec of ADDONS) {
    const { code } = spec;
    const a = await prisma.addOn.findUnique({ where: { code } });
    const cents = pesos(spec.price);
    // Priority is new, so a database seeded before it has no row to update.
    // Creating it is the difference between a run that finishes and a
    // catalogue that still cannot sell the thing the code offers.
    if (!a) {
      console.info(`  ${code.padEnd(22)} ${col(cents).trim().padStart(11)}   created`);
      if (!dry) {
        const made = await prisma.addOn.create({ data: { code, name: spec.name, description: spec.description, priceCents: cents, sortOrder: spec.sortOrder } });
        await audit(null, {
          module: 'settings', action: 'addon.save', entityType: 'AddOn', entityId: made.id,
          summary: `${code} created (set-pricing)`, after: { priceCents: cents }, sensitive: true,
        });
      }
      changed++;
      continue;
    }
    if (a.priceCents === cents && a.active) {
      console.info(`  ${code.padEnd(22)} ${col(a.priceCents)}   unchanged`);
      continue;
    }
    console.info(`  ${code.padEnd(22)} ${col(a.priceCents)} → ${col(cents)}`);
    if (!dry) {
      await prisma.addOn.update({ where: { id: a.id }, data: { priceCents: cents, active: true } });
      await audit(null, {
        module: 'settings', action: 'addon.save', entityType: 'AddOn', entityId: a.id,
        summary: `${code} price (set-pricing)`,
        before: { priceCents: a.priceCents, active: a.active }, after: { priceCents: cents, active: true }, sensitive: true,
      });
    }
    changed++;
  }

  for (const code of RETIRED_ADDONS) {
    const a = await prisma.addOn.findUnique({ where: { code } });
    if (!a) continue;
    if (!a.active) {
      console.info(`  ${code.padEnd(22)} already withdrawn`);
      continue;
    }
    console.info(`  ${code.padEnd(22)} withdrawn (the design is settled at publish)`);
    if (!dry) {
      await prisma.addOn.update({ where: { id: a.id }, data: { active: false } });
      await audit(null, {
        module: 'settings', action: 'addon.save', entityType: 'AddOn', entityId: a.id,
        summary: `${code} withdrawn (set-pricing)`, before: { active: true }, after: { active: false }, sensitive: true,
      });
    }
    changed++;
  }

  console.info(`\n${dry ? 'Would change' : 'Changed'} ${changed} row(s).\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
