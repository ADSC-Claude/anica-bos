/**
 * Moves one invitation onto a different package.
 *
 * The same thing as the "Transfer package" control in admin, for the times
 * there is nobody signed in to click it — a demo that needs to show what the
 * top package includes, a correction after a payment taken outside the site.
 * It writes the same column and records the same audit entry, so the history
 * does not care which one was used.
 *
 * It does NOT touch the order. An order is the record of what was sold and for
 * how much, and a package moved by hand is a gift or a correction, not a second
 * sale: rewriting the order would put money in the books that nobody paid.
 *
 * It changes nothing until told to:
 *
 *   npm run set:tier -- --invitation juan-and-maria --tier LUXURY
 *   npm run set:tier -- --invitation juan-and-maria --tier LUXURY --apply
 */
import type { Tier } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { audit } from '../src/lib/audit';
import { TIERS, TIER_LABELS } from '../src/lib/tiers';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const value = (flag: string) => ((i) => (i >= 0 ? (args[i + 1] ?? '').trim() : ''))(args.indexOf(flag));

async function main() {
  const only = value('--invitation');
  const tier = value('--tier').toUpperCase() as Tier;

  if (!only) {
    console.error('Which invitation? --invitation <slug|id>');
    process.exit(1);
  }
  // Checked against TIERS for the same reason the checkout is: a list of
  // package names typed out anywhere goes stale the day a package is added.
  if (!TIERS.includes(tier)) {
    console.error(`"${value('--tier')}" is not a package. One of: ${TIERS.join(', ')}.`);
    process.exit(1);
  }

  const inv = await prisma.invitation.findFirst({
    where: { OR: [{ slug: only }, { id: only }] },
    select: { id: true, slug: true, title: true, tier: true, status: true, user: { select: { name: true, email: true } } },
  });
  if (!inv) {
    console.error(`No invitation with slug or id "${only}".`);
    process.exit(1);
  }

  // Printed before anything is written, because the one way this goes wrong is
  // moving somebody else's invitation: two customers can have similar slugs,
  // and the owner's name is what makes a mistake obvious at a glance.
  console.info(`  ${inv.slug}  “${inv.title}”  ${inv.status}`);
  console.info(`  owner: ${inv.user.name}`);
  console.info(`  package: ${TIER_LABELS[inv.tier]} → ${TIER_LABELS[tier]}`);

  if (inv.tier === tier) {
    console.info(`\nAlready on ${TIER_LABELS[tier]}. Nothing to do.`);
    return;
  }
  if (!apply) {
    console.info('\nDry run — nothing written. Add --apply to move it.');
    return;
  }

  await prisma.invitation.update({ where: { id: inv.id }, data: { tier } });
  await audit(null, {
    module: 'invitations',
    action: 'tier.set',
    entityType: 'Invitation',
    entityId: inv.id,
    summary: `${inv.slug}: ${inv.tier} → ${tier} (set-tier)`,
    before: { tier: inv.tier },
    after: { tier },
    sensitive: true,
  });
  console.info(`\nMoved to ${TIER_LABELS[tier]}. The order is unchanged.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
