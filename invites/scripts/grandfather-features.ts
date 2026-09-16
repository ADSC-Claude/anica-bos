/**
 * Gives back the features an invitation was sold with and lost when they moved
 * up a package.
 *
 * #127 added Luxury and moved the seating chart, event-day check-in and the
 * shared album from Signature up to it. `entitled()` reads the tier as it is
 * today, so every Signature invitation already sold lost all three the moment
 * that deployed — no warning, no record, and a locked upgrade screen where the
 * page used to be. The shared album is the sharp one: guests may have uploaded
 * photos the couple can no longer reach.
 *
 * This finds them and, told to, hands the features back by writing the add-on
 * codes that grant them onto the invitation. What it cannot do it says out
 * loud: the shared album has no add-on behind it, so an invitation that lost
 * that is reported and left alone, and the number is at the end of the run.
 *
 * It changes nothing until told to:
 *
 *   npm run grandfather                  # what was lost, and by whom
 *   npm run grandfather -- --apply       # put back what can be put back
 *   npm run grandfather -- --invitation juan-and-maria   # one, by slug or id
 *
 * Every write is audited, the same as a feature switched on by hand in admin.
 */
import { prisma } from '../src/lib/db';
import { audit } from '../src/lib/audit';
import { MOVED, lost, restoreCodes } from '../src/lib/grandfather';
import { TIER_LABELS } from '../src/lib/tiers';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const only = ((i) => (i >= 0 ? (args[i + 1] ?? '').trim() : ''))(args.indexOf('--invitation'));

/**
 * Whether the couple actually used what they lost.
 *
 * A feature nobody touched is a promise broken on paper. A seating chart with
 * guests at tables, a door somebody was scanned through, an album with photos
 * in it — that is work and memories behind a lock, and it is the difference
 * between a tidy-up and an apology.
 */
async function inUse(invitationId: string) {
  const [seated, checkedIn, photos] = await Promise.all([
    prisma.guest.count({ where: { invitationId, tableId: { not: null } } }),
    prisma.guest.count({ where: { invitationId, checkedInAt: { not: null } } }),
    prisma.media.count({ where: { invitationId, kind: 'GUEST_PHOTO' } }),
  ]);
  return { seating: seated, checkin: checkedIn, photoSharing: photos } as Record<string, number>;
}

async function main() {
  const invitations = await prisma.invitation.findMany({
    where: only ? { OR: [{ slug: only }, { id: only }] } : {},
    select: { id: true, slug: true, title: true, tier: true, addOns: true, createdAt: true, status: true },
    orderBy: { createdAt: 'asc' },
  });
  if (only && !invitations.length) {
    console.error(`No invitation with slug or id "${only}".`);
    process.exit(1);
  }

  console.info(apply ? 'Writing.\n' : 'Dry run — nothing will be written. Add --apply to write.\n');

  let affected = 0;
  let restored = 0;
  const stranded: { slug: string; feature: string; used: number }[] = [];

  for (const inv of invitations) {
    const missing = lost(inv);
    if (!missing.length) continue;
    affected++;

    const used = await inUse(inv.id);
    const describe = missing
      .map((m) => `${m.feature}${used[m.feature] ? ` (${used[m.feature]} in use)` : ''}`)
      .join(', ');
    console.info(`  ${inv.slug.padEnd(34)} ${TIER_LABELS[inv.tier].padEnd(10)} ${inv.status.padEnd(10)} lost ${describe}`);

    for (const m of missing) {
      if (m.restoreWith) continue;
      stranded.push({ slug: inv.slug, feature: m.feature, used: used[m.feature] ?? 0 });
    }

    const codes = restoreCodes(inv);
    if (!codes.length) continue;
    console.info(`  ${' '.repeat(34)} ${apply ? 'giving back' : 'would give back'} ${codes.join(', ')}`);
    restored++;
    if (!apply) continue;

    const after = [...inv.addOns, ...codes];
    await prisma.invitation.update({ where: { id: inv.id }, data: { addOns: after } });
    await audit(null, {
      module: 'invitations',
      action: 'invitation.grandfather',
      entityType: 'Invitation',
      entityId: inv.id,
      summary: `${inv.slug}: ${codes.join(', ')} restored (grandfather-features)`,
      before: { addOns: inv.addOns },
      after: { addOns: after },
      sensitive: true,
    });
  }

  console.info('');
  if (!affected) {
    console.info('Nothing to put back: no invitation was sold a feature it has since lost.');
    return;
  }
  console.info(`${affected} invitation(s) lost something they were sold.`);
  console.info(`${restored} ${apply ? 'had' : 'would have'} it given back by add-on.`);

  if (stranded.length) {
    // Said last and said plainly, because this is the part no run fixes. The
    // features with no add-on behind them are listed in MOVED with
    // restoreWith: null, and giving one back needs a code to grant it — a
    // decision about what is for sale, not a line in this script.
    const used = stranded.filter((s) => s.used > 0);
    console.info('');
    console.info(`${stranded.length} loss(es) cannot be put back by this script — no add-on grants them:`);
    for (const s of stranded) {
      console.info(`  ${s.slug.padEnd(34)} ${s.feature}${s.used ? `  — ${s.used} already uploaded` : ''}`);
    }
    if (used.length) {
      console.info('');
      console.info(`${used.length} of those have the customer's own work behind the lock.`);
    }
  }

  // The move this run is unpicking, for whoever reads the log later.
  console.info('');
  console.info('Moves on record:');
  for (const m of MOVED) {
    console.info(`  ${m.feature.padEnd(14)} left ${TIER_LABELS[m.was]} on ${m.on}  ${m.restoreWith ?? '(no add-on grants it)'}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
