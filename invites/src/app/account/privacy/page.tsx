import { requireCustomerPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui';
import { EraseAccount } from './erase';

export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  const user = await requireCustomerPage();
  const settings = await getSettings();
  const [invitations, guests] = await Promise.all([
    prisma.invitation.count({ where: { userId: user.id } }),
    prisma.guest.count({ where: { invitation: { userId: user.id } } }),
  ]);

  return (
    <>
      <PageHeader
        title="Your data"
        subtitle="What we hold, how to get a copy of it, and how to have it deleted — under the Data Privacy Act of 2012 (RA 10173)."
      />

      <div className="card mb-4 space-y-3 p-5">
        <h2 className="font-semibold">Get a copy</h2>
        <p className="text-sm text-[color:var(--color-ink-700)]">
          A single file with your account details, your orders, every invitation you have made and
          the guest lists inside them. Those guest lists contain other people’s names and numbers,
          so keep the file somewhere sensible.
        </p>
        <a href="/account/privacy/export" className="btn btn-secondary btn-sm">Download my data</a>
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="font-semibold">Delete everything</h2>
        <p className="text-sm text-[color:var(--color-ink-700)]">
          This removes {invitations === 1 ? 'your invitation' : `all ${invitations} of your invitations`}
          {guests > 0 && <> and the {guests} {guests === 1 ? 'guest' : 'guests'} on {invitations === 1 ? 'it' : 'them'}</>},
          along with every RSVP, message and photo. Published links stop working immediately, and none of it can be brought back.
        </p>
        <p className="text-sm text-[color:var(--color-ink-700)]">
          Your receipts stay. The law requires us to keep records of what was sold for ten years, so
          the order and its payments remain — with your name, email and phone number removed from
          them. You will not be able to sign in again.
        </p>
        <EraseAccount />
        <p className="text-xs text-[color:var(--color-ink-500)]">
          Would rather talk to a person first? Message us on {settings['contact.messenger'] || 'Messenger'} or
          email {settings['business.email']}.
        </p>
      </div>
    </>
  );
}
