/**
 * Sets the price, fees and revision rounds on every package, and the queue-jump
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
 * A tier missing from the catalogue entirely is created rather than skipped.
 * The seed only ever runs on an empty database, so a package added after
 * launch — Luxury was — would otherwise exist in the code and be unsellable in
 * production, which is the same failure the add-on loop below already guards
 * against.
 *
 * Orders already placed are unaffected: an order snapshots its own
 * `subtotalCents`, `serviceFeeCents` and line items at checkout, so nothing
 * downstream re-reads a package to price a sale that already happened.
 *
 *   npm run db:pricing            # apply
 *   npm run db:pricing -- --dry   # show what would change
 */
import type { Occasion, Tier } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { ADDONS, RETIRED_ADDONS, SHELVED_ADDONS } from '../src/lib/addon-catalogue';
import { audit } from '../src/lib/audit';
import { formatPeso } from '../src/lib/money';
import { TIERS, TIER_LABELS } from '../src/lib/tiers';

/**
 * Pesos, by tier. COMPLETE is the tier sold as "Signature" — the enum name
 * predates the label and is not worth a migration to rename.
 *
 * Both fee columns are zero, because both modes they priced are withdrawn.
 * Concierge went when speed became the rush or priority add-on. Do-it-yourself
 * went because there was never anything behind it: the intake form and the
 * builder are generated from the same definition, so a customer filling the
 * form was already doing the work and paying a fee for the privilege. Now
 * there is one product — we build it — and the base price carries it:
 * 2,500 / 4,000 / 6,000, which is what a Done-For-You order came to before,
 * give or take the 200 knocked off Standard to round it. Luxury came later, at
 * 7,500, and was raised to 8,000 with the twenty-photo gallery in #132.
 *
 * The columns stay so orders sold under either mode still reconcile.
 */
const FEES: Record<Tier, { base: number; dfy: number; concierge: number; rounds: number; validity: number; tagline: string }> = {
  BASIC: { base: 2_500, dfy: 0, concierge: 0, rounds: 2, validity: 30, tagline: 'The essentials: cover, venue, parents, dress code and a simple RSVP.' },
  STANDARD: { base: 4_000, dfy: 0, concierge: 0, rounds: 4, validity: 182, tagline: 'Any design, the full entourage, gift QR, gallery, music, RSVP dashboard.' },
  COMPLETE: { base: 6_000, dfy: 0, concierge: 0, rounds: 6, validity: 365, tagline: 'Per-guest links, guestbook, meal choice and Signature-only designs.' },
  // Luxury buys the event-day half of the service — the seating chart, the
  // check-in desk, the album afterwards — and two more rounds of drafting on
  // top, because the package with the most on its page is the one that takes
  // the most passes to get right.
  LUXURY: { base: 8_000, dfy: 0, concierge: 0, rounds: 8, validity: 365, tagline: 'The day itself: seating chart, QR check-in, shared album, Save the Date included.' },
};

/**
 * The occasions a package is sold for. Only read when creating one that is
 * missing.
 *
 * No per-occasion scale, deliberately: the update pass above writes the flat
 * base to every occasion, so a row created at a scaled price would be flattened
 * by the very next run. The seed scales because it is describing a catalogue
 * nobody has priced yet; this script is the grid, and the grid is flat.
 */
const OCCASION_PACKAGES: { occasion: Occasion | null; label: string }[] = [
  { occasion: 'WEDDING', label: 'Wedding' },
  { occasion: 'DEBUT', label: 'Debut' },
  { occasion: 'CHRISTENING', label: 'Christening' },
  { occasion: 'KIDS_BIRTHDAY', label: "Kids' Birthday" },
  { occasion: null, label: 'Celebration' },
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
    const revisionRounds = target.rounds;
    // The wording is reconciled too, for the same reason the add-ons' is: a
    // tagline is what a customer reads on the card, and Signature's promised a
    // seating chart and QR check-in for months after both moved to Luxury. A
    // run that fixed the price and left that would keep the catalogue lying.
    const taglineSame = p.tagline === target.tagline;
    if (taglineSame && p.priceCents === priceCents && p.dfyFeeCents === dfyFeeCents && p.conciergeFeeCents === conciergeFeeCents && p.revisionRounds === revisionRounds) {
      console.info(`  ${p.code.padEnd(22)} ${col(p.priceCents)}   unchanged`);
      continue;
    }

    console.info(`  ${p.code.padEnd(22)} base ${col(p.priceCents)} → ${col(priceCents)}   DFY ${col(p.dfyFeeCents)} → ${col(dfyFeeCents)}   rounds ${String(p.revisionRounds).padStart(2)} → ${String(revisionRounds).padStart(2)}`);
    if (!dry) {
      const before = { priceCents: p.priceCents, dfyFeeCents: p.dfyFeeCents, conciergeFeeCents: p.conciergeFeeCents, revisionRounds: p.revisionRounds };
      await prisma.package.update({ where: { id: p.id }, data: { priceCents, dfyFeeCents, conciergeFeeCents, revisionRounds, tagline: target.tagline } });
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
        after: { priceCents, dfyFeeCents, conciergeFeeCents, revisionRounds },
        sensitive: true,
      });
    }
    changed++;
  }

  // A tier the code sells but the catalogue has never heard of. The seed only
  // runs on an empty database, so without this a package added after launch is
  // sellable everywhere except production.
  const existing = new Set(packages.map((p) => p.code));
  let sortOrder = Math.max(0, ...packages.map((p) => p.sortOrder)) + 1;
  for (const op of OCCASION_PACKAGES) {
    for (const tier of TIERS) {
      const code = `${op.occasion ?? 'ANY'}_${tier}`;
      if (existing.has(code)) continue;
      const target = FEES[tier];
      const priceCents = pesos(target.base);
      console.info(`  ${code.padEnd(22)} ${col(priceCents)}   created`);
      if (!dry) {
        const made = await prisma.package.create({
          data: {
            code,
            occasion: op.occasion,
            tier,
            name: `${op.label} ${TIER_LABELS[tier]}`,
            tagline: target.tagline,
            priceCents,
            dfyFeeCents: pesos(target.dfy),
            conciergeFeeCents: pesos(target.concierge),
            revisionRounds: target.rounds,
            linkValidityDays: target.validity,
            sortOrder: sortOrder++,
          },
        });
        await audit(null, {
          module: 'settings', action: 'package.save', entityType: 'Package', entityId: made.id,
          summary: `${code} created (set-pricing)`, after: { priceCents }, sensitive: true,
        });
      }
      changed++;
    }
  }

  for (const spec of ADDONS) {
    const { code } = spec;
    const a = await prisma.addOn.findUnique({ where: { code } });
    const cents = pesos(spec.price);
    // A held row is catalogued and not for sale: the price is settled and
    // editable, and `active: false` keeps it off the landing page and out of
    // the checkout, both of which read only active rows.
    const active = !spec.held;
    const note = spec.held ? '   held' : '';
    // Priority is new, so a database seeded before it has no row to update.
    // Creating it is the difference between a run that finishes and a
    // catalogue that still cannot sell the thing the code offers.
    if (!a) {
      console.info(`  ${code.padEnd(22)} ${col(cents).trim().padStart(11)}   created${note}`);
      if (!dry) {
        const made = await prisma.addOn.create({ data: { code, name: spec.name, description: spec.description, imageUrl: spec.image ?? '', priceCents: cents, active, sortOrder: spec.sortOrder } });
        await audit(null, {
          module: 'settings', action: 'addon.save', entityType: 'AddOn', entityId: made.id,
          summary: `${code} created (set-pricing)`, after: { priceCents: cents, active }, sensitive: true,
        });
      }
      changed++;
      continue;
    }
    // The wording is reconciled too, not just the money. A description is what
    // the customer reads on the checkout card, and these ones named a service
    // mode that no longer exists — a run that fixed the price and left "your
    // Done-For-You build" on the row would leave the catalogue lying.
    const wordingSame = a.name === spec.name && a.description === spec.description;
    // The picture is reconciled the same way, with one difference: a catalogue
    // row with no `image` has no opinion about the picture rather than an
    // opinion that there should be none, so a run never wipes one somebody
    // typed into admin. A picture declared here does win over a typed one,
    // exactly as the wording does.
    const image = spec.image ?? '';
    const pictureSame = !image || a.imageUrl === image;
    if (a.priceCents === cents && a.active === active && wordingSame && pictureSame) {
      console.info(`  ${code.padEnd(22)} ${col(a.priceCents)}   unchanged${note}`);
      continue;
    }
    console.info(`  ${code.padEnd(22)} ${col(a.priceCents)} → ${col(cents)}${wordingSame ? '' : '   + wording'}${pictureSame ? '' : '   + picture'}${note}`);
    if (!dry) {
      await prisma.addOn.update({ where: { id: a.id }, data: { priceCents: cents, active, name: spec.name, description: spec.description, ...(image ? { imageUrl: image } : {}) } });
      await audit(null, {
        module: 'settings', action: 'addon.save', entityType: 'AddOn', entityId: a.id,
        summary: `${code} price and wording (set-pricing)`,
        before: { priceCents: a.priceCents, active: a.active, name: a.name, description: a.description, imageUrl: a.imageUrl },
        after: { priceCents: cents, active, name: spec.name, description: spec.description, imageUrl: image || a.imageUrl },
        sensitive: true,
      });
    }
    changed++;
  }

  for (const { code, reason } of RETIRED_ADDONS) {
    const a = await prisma.addOn.findUnique({ where: { code } });
    if (!a) continue;
    if (!a.active) {
      console.info(`  ${code.padEnd(22)} already withdrawn`);
      continue;
    }
    console.info(`  ${code.padEnd(22)} withdrawn (${reason})`);
    if (!dry) {
      await prisma.addOn.update({ where: { id: a.id }, data: { active: false } });
      await audit(null, {
        module: 'settings', action: 'addon.save', entityType: 'AddOn', entityId: a.id,
        summary: `${code} withdrawn — ${reason} (set-pricing)`, before: { active: true }, after: { active: false }, sensitive: true,
      });
    }
    changed++;
  }

  // Off the website, still in the system. Same deactivation as retiring and a
  // different decision, so it is reported in its own words: these come back.
  for (const { code, reason } of SHELVED_ADDONS) {
    const a = await prisma.addOn.findUnique({ where: { code } });
    if (!a) continue;
    if (!a.active) {
      console.info(`  ${code.padEnd(22)} already off the website`);
      continue;
    }
    console.info(`  ${code.padEnd(22)} off the website (${reason})`);
    if (!dry) {
      // Price and wording untouched: hiding a row is not a reason to overrule
      // the admin about what it costs.
      await prisma.addOn.update({ where: { id: a.id }, data: { active: false } });
      await audit(null, {
        module: 'settings', action: 'addon.save', entityType: 'AddOn', entityId: a.id,
        summary: `${code} off the website — ${reason} (set-pricing)`,
        before: { active: true }, after: { active: false }, sensitive: true,
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
