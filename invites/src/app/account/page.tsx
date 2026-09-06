import Link from 'next/link';
import { requireCustomerPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { occasionLabel } from '@/lib/occasions';
import { TIER_LABELS } from '@/lib/tiers';
import { formatDate } from '@/lib/datetime';
import { PageHeader, InvitationPill, OrderPill, Empty, Money } from '@/components/ui';
import { imageUrl, IMAGE } from '@/lib/images';
import { invitationPath } from '@/lib/app-url';

export const dynamic = 'force-dynamic';

export default async function AccountHome() {
  const user = await requireCustomerPage();
  const [invitations, pendingOrders] = await Promise.all([
    prisma.invitation.findMany({
      where: { userId: user.id, status: { not: 'ARCHIVED' } },
      include: { order: { select: { status: true, serviceMode: true, reference: true } }, dfyJob: { select: { status: true } }, _count: { select: { rsvps: true, guests: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.findMany({ where: { userId: user.id, status: 'PENDING_PAYMENT' }, orderBy: { createdAt: 'desc' } }),
  ]);

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(' ')[0]}`} subtitle="Your invitations, orders and RSVPs in one place." actions={<Link href="/checkout" className="btn btn-primary">Create a new invitation</Link>} />

      {pendingOrders.length > 0 && (
        <div className="mb-6 space-y-2">
          {pendingOrders.map((o) => (
            <div key={o.id} className="card flex flex-wrap items-center justify-between gap-3 border-[color:var(--warn)] p-4">
              <div>
                <p className="font-semibold">Order {o.reference} is waiting for payment</p>
                <p className="text-sm text-[color:var(--color-ink-500)]">{occasionLabel(o.occasion)} · {TIER_LABELS[o.tier]} · <Money cents={o.totalCents} /></p>
              </div>
              <Link href={`/checkout/pay/${o.reference}`} className="btn btn-primary">Pay now</Link>
            </div>
          ))}
        </div>
      )}

      {invitations.length === 0 ? (
        <Empty>No invitations yet. <Link href="/checkout" className="underline">Create your first one</Link> — it takes about ten minutes.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {invitations.map((inv) => {
            const active = inv.order?.status === 'ACTIVE' || inv.order?.status === 'PAID' || !inv.order;
            const dfy = inv.order?.serviceMode && inv.order.serviceMode !== 'DIY';
            return (
              <div key={inv.id} className="card overflow-hidden">
                <div className="flex gap-4 p-4">
                  <div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-[color:var(--color-sand-100)]">
                    {inv.ogImageUrl && <img src={imageUrl(inv.ogImageUrl, IMAGE.thumb)} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="display truncate text-lg">{inv.title}</h2>
                      <InvitationPill status={inv.status} />
                    </div>
                    <p className="text-xs text-[color:var(--color-ink-500)]">{occasionLabel(inv.occasion)} · {TIER_LABELS[inv.tier]}{dfy ? ` · ${inv.order?.serviceMode === 'CONCIERGE' ? 'Concierge' : 'Done-For-You'}` : ''}{inv.eventAt ? ` · ${formatDate(inv.eventAt)}` : ''}</p>
                    <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">{inv.viewCount} views · {inv._count.rsvps} RSVPs{inv._count.guests ? ` · ${inv._count.guests} guests` : ''}</p>
                    {!active && inv.order && <p className="mt-1 text-xs"><OrderPill status={inv.order.status} /> <Link href={`/checkout/pay/${inv.order.reference}`} className="underline">Pay to unlock</Link></p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-[color:var(--color-sand-100)] px-4 py-3 text-sm">
                  <Link href={`/account/invitations/${inv.id}`} className="btn btn-secondary btn-sm">Dashboard</Link>
                  {active && (dfy ? <Link href={`/account/invitations/${inv.id}/dfy`} className="btn btn-primary btn-sm">{inv.dfyJob?.status === 'NEW' ? 'Send details' : 'DFY status'}</Link> : <Link href={`/account/invitations/${inv.id}/builder`} className="btn btn-primary btn-sm">Edit</Link>)}
                  {inv.status === 'PUBLISHED' && <a href={invitationPath(inv.slug)} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">View live</a>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
