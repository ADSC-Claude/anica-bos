import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveInvitation, PasswordGate } from '../../shared';
import { contentOf, resolveTheme } from '@/lib/invitations';
import { entitled } from '@/lib/tiers';
import { invitationUrl } from '@/lib/app-url';
import { displayTitle } from '@/lib/sections';
import { Pass } from '@/components/invite/pass';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  // A pass is one person's, and it is the thing that opens a door.
  return { title: 'Your check-in pass', robots: { index: false, follow: false } };
}

/**
 * One guest's check-in pass.
 *
 * Behind the same door as their invitation — the token has to resolve to a
 * guest on this invitation, and a password on the page still holds — and
 * behind the check-in entitlement as well, because a pass for an event with
 * no door desk is a screen that promises something nobody will do.
 */
export default async function PassPage({ params }: Params) {
  const { slug, token } = await params;
  const { invitation, guest, locked } = await resolveInvitation(slug, token);
  if (locked) return <PasswordGate slug={slug} token={token} />;
  if (!guest) notFound();
  if (!entitled(invitation, 'checkin')) notFound();

  const content = contentOf(invitation.content);
  const { palette, fonts } = resolveTheme(invitation.template, content, invitation.tier);
  const reply = guest.rsvps?.[0];

  return (
    <Pass
      occasion={invitation.occasion}
      content={content}
      palette={palette}
      fonts={fonts}
      hostsTitle={invitation.title || displayTitle(invitation.occasion, content)}
      url={invitationUrl(slug, guest.token)}
      guest={{
        name: guest.name,
        salutation: guest.salutation,
        groupName: guest.groupName,
        token: guest.token,
        table: guest.table,
        checkedIn: Boolean((guest as { checkedInAt?: Date | null }).checkedInAt),
        declined: reply?.response === 'DECLINE',
      }}
    />
  );
}
