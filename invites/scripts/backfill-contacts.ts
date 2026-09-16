/**
 * Carries contact details from replies already collected onto the guest rows
 * that a blast actually reads.
 *
 * Until the reply started writing them back, a guest who typed their number and
 * address into the RSVP form left them on the reply alone, and the guest row
 * stayed as the couple had typed it — usually blank. So every invitation that
 * collected replies before that has a guest list that looks emptier than it is,
 * and a couple looking at it would conclude their guests never gave them
 * anything. This is the one-off for that backlog. New replies need nothing.
 *
 * It only fills gaps. Where a reply disagrees with a row that already has
 * something, it leaves the row alone and says so: going over replies collected
 * months ago there is no way to tell whether the couple corrected the row
 * afterwards, and a blast skips a blank rather than a mismatch.
 *
 * It changes nothing until told to:
 *
 *   npm run backfill:contacts                                # dry run, every invitation
 *   npm run backfill:contacts -- --apply                     # write it
 *   npm run backfill:contacts -- --invitation juan-and-maria  # one invitation, by slug or id
 */
import { prisma } from '../src/lib/db';
import { contactPatch, plainAddress } from '../src/lib/contacts';
import { mailable } from '../src/lib/email';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const only = ((i) => (i >= 0 ? (args[i + 1] ?? '').trim() : ''))(args.indexOf('--invitation'));

type Tally = { phone: number; email: number; already: number; differs: number; silent: number; noReply: number };
const KEYS = ['phone', 'email', 'already', 'differs', 'silent', 'noReply'] as const;
const zero = (): Tally => ({ phone: 0, email: 0, already: 0, differs: 0, silent: 0, noReply: 0 });
const add = (a: Tally, b: Tally): Tally =>
  Object.fromEntries(KEYS.map((k) => [k, a[k] + b[k]])) as Tally;

async function main() {
  const invitations = await prisma.invitation.findMany({
    where: only ? { OR: [{ slug: only }, { id: only }] } : {},
    select: { id: true, slug: true, title: true },
    orderBy: { createdAt: 'asc' },
  });
  if (only && !invitations.length) {
    console.error(`No invitation with slug or id "${only}".`);
    process.exit(1);
  }

  console.log(apply ? 'Writing.\n' : 'Dry run — nothing will be written. Add --apply to write.\n');

  let total = zero();
  let touched = 0;

  for (const invitation of invitations) {
    const guests = await prisma.guest.findMany({
      where: { invitationId: invitation.id },
      // The latest reply only. A guest who answered and then changed their mind
      // has one row that submitRsvp keeps updating, but an older list can carry
      // more than one, and the newest is the one worth believing.
      include: { rsvps: { orderBy: { updatedAt: 'desc' }, take: 1 } },
      orderBy: { name: 'asc' },
    });

    const tally = zero();
    const lines: string[] = [];

    for (const guest of guests) {
      const reply = guest.rsvps[0];
      if (!reply) {
        tally.noReply++;
        continue;
      }
      const patch = contactPatch(reply, guest, { fillBlanksOnly: true });
      if (patch.phone) tally.phone++;
      if (patch.email) tally.email++;
      if (Object.keys(patch).length) {
        lines.push(`    + ${guest.name}: ${describe(patch)}`);
        if (apply) await prisma.guest.update({ where: { id: guest.id }, data: patch });
      }

      // A disagreement is reported on its own, because it can sit beside a fill:
      // a guest whose address was missing and whose number the couple had typed
      // differently is both. Reporting only one of the two would hide the half
      // that needs a person to look at it.
      const held = disagreements(reply, guest);
      if (held.length) {
        tally.differs++;
        lines.push(`    ~ ${guest.name}: reply says ${held.join(' · ')} — left alone, the list already says otherwise`);
        continue;
      }
      if (Object.keys(patch).length) continue;

      // Nothing to do, and two ways to arrive there worth telling apart: a
      // reply that repeated what was already on file, and a reply that never
      // answered the question. Only the second is data the couple still lacks.
      if (Object.keys(contactPatch(reply, { phone: '', email: '' })).length) tally.already++;
      else tally.silent++;
    }

    // Replies from the general link carry no guest, so there is nobody to put
    // them on. Matching by name would be a guess, and a wrong guess writes a
    // stranger's number onto somebody's row — so they are counted and left.
    const loose = await prisma.rsvp.count({
      where: { invitationId: invitation.id, guestId: null, OR: [{ phone: { not: '' } }, { email: { not: '' } }] },
    });

    if (tally.phone || tally.email || tally.differs) {
      touched++;
      console.log(`  ${invitation.title} (${invitation.slug})`);
      for (const line of lines) console.log(line);
      console.log(`    ${tally.phone} number(s), ${tally.email} address(es)${loose ? `, ${loose} reply(s) with no personal link — not attributable` : ''}\n`);
    }
    total = add(total, tally);
  }

  console.log(
    [
      `${invitations.length} invitation(s) read, ${touched} with something to report.`,
      `${total.phone} number(s) and ${total.email} address(es) ${apply ? 'written' : 'would be written'}.`,
      `${total.differs} left alone where the reply disagrees with the list.`,
      `${total.already} already on file, ${total.silent} reply(s) that left both blank, ${total.noReply} guest(s) with no reply yet.`,
    ].join('\n'),
  );
  if (!apply && (total.phone || total.email)) console.log('\nRe-run with --apply to write.');
}

/**
 * Where a reply and the list both have an answer and the answers differ. These
 * are the ones a person has to settle: the back-fill will not pick a winner
 * months after the fact.
 */
function disagreements(reply: { phone: string; email: string }, guest: { phone: string; email: string }): string[] {
  const offered = contactPatch(reply, guest);
  return [
    ...(offered.phone && guest.phone ? [offered.phone] : []),
    ...(offered.email && guest.email ? [offered.email] : []),
  ];
}

/** What a patch or a row amounts to, in the words the guest page uses. */
function describe(c: { phone?: string; email?: string }): string {
  const address = plainAddress(c.email ?? '');
  return (
    [c.phone?.trim(), mailable(address) ? address : ''].filter(Boolean).join(' · ') || 'nothing'
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
