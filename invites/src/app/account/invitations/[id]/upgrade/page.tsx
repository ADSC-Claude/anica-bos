import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { packageFor } from '@/lib/orders';
import { TIERS, TIER_LABELS, COMPARISON, tierAtLeast } from '@/lib/tiers';
import { formatPesoShort } from '@/lib/money';
import { PageHeader } from '@/components/ui';
import { UpgradeButton } from './button';

export const dynamic = 'force-dynamic';

export default async function UpgradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  const packages = await Promise.all(TIERS.map((t) => packageFor(inv.occasion, t)));
  const current = packages.find((p) => p.tier === inv.tier)!;
  const options = packages.filter((p) => !tierAtLeast(inv.tier, p.tier));
  return (
    <>
      <Link href={`/account/invitations/${inv.id}`} className="text-sm text-[color:var(--color-plum-600)] hover:underline">← {inv.title}</Link>
      <PageHeader title="Upgrade your package" subtitle={`You are on ${TIER_LABELS[inv.tier]}. Pay only the difference; everything you have built stays.`} />
      {options.length === 0 ? <p className="card p-5">You already have everything — Complete is the top tier.</p> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {options.map((p) => (
            <div key={p.id} className="card p-5">
              <p className="eyebrow">{TIER_LABELS[p.tier]}</p>
              <p className="display text-3xl">{formatPesoShort(Math.max(0, p.priceCents - current.priceCents))}</p>
              <p className="text-xs text-[color:var(--color-ink-500)]">{formatPesoShort(p.priceCents)} − {formatPesoShort(current.priceCents)} already paid</p>
              <ul className="mt-3 space-y-1 text-sm">
                {COMPARISON.filter((r) => r.cells[p.tier] && !r.cells[inv.tier]).map((r) => <li key={r.label}>✓ {r.label}</li>)}
              </ul>
              <UpgradeButton invitationId={inv.id} tier={p.tier as 'STANDARD' | 'COMPLETE'} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
