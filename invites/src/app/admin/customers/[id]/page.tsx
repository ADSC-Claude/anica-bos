import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, BackLink, OrderPill, InvitationPill, Money } from '@/components/ui';
import { Flash, type FlashParams } from '../../flash';
import { customerNotesAction, customerActiveAction, supportReplyAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  const user = await requireStaffPage('customers.view');
  const { id } = await params;
  const sp = await searchParams;
  const c = await prisma.user.findUnique({ where: { id }, include: { orders: { orderBy: { createdAt: 'desc' }, include: { package: true } }, invitations: { orderBy: { createdAt: 'desc' } }, supportMessages: { orderBy: { createdAt: 'asc' }, take: 100 } } });
  if (!c) notFound();
  const back = `/admin/customers/${c.id}`;
  const editable = can(user.role, 'customers.edit');
  return (
    <>
      <BackLink href="/admin/customers">Customers</BackLink>
      <PageHeader title={c.name} subtitle={<>{c.email}{c.phone && ` · ${c.phone}`} · joined {formatDateTime(c.createdAt)}{!c.active && <span className="pill pill-bad ml-2">Disabled</span>}</>} />
      <Flash {...sp} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Invitations</h2>
          <table className="data"><tbody>{c.invitations.map((i) => <tr key={i.id}><td><Link href={`/admin/invitations/${i.id}`} className="underline">{i.title}</Link></td><td>{i.tier}</td><td><InvitationPill status={i.status} /></td></tr>)}</tbody></table>
          {c.invitations.length === 0 && <p className="text-sm text-[color:var(--color-ink-500)]">None.</p>}
        </section>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Orders</h2>
          <table className="data"><tbody>{c.orders.map((o) => <tr key={o.id}><td><Link href={`/admin/orders/${o.id}`} className="font-mono underline">{o.reference}</Link><span className="block text-xs text-[color:var(--color-ink-500)]">{o.package.name}</span></td><td><Money cents={o.totalCents} /></td><td><OrderPill status={o.status} /></td></tr>)}</tbody></table>
          {c.orders.length === 0 && <p className="text-sm text-[color:var(--color-ink-500)]">None.</p>}
        </section>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Support notes</h2>
          <form action={customerNotesAction.bind(null, c.id, back)}><textarea name="notes" defaultValue={c.notes} rows={4} className="field" disabled={!editable} />{editable && <button className="btn btn-secondary btn-sm mt-2" type="submit">Save notes</button>}</form>
          {editable && (
            <form action={customerActiveAction.bind(null, c.id, back)} className="mt-3">
              <input type="hidden" name="active" value={c.active ? 'off' : 'on'} />
              <button className={`btn btn-sm ${c.active ? 'btn-danger' : 'btn-secondary'}`} type="submit">{c.active ? 'Disable account' : 'Enable account'}</button>
            </form>
          )}
        </section>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Messages</h2>
          <ul className="space-y-2">{c.supportMessages.map((m) => <li key={m.id} className={`max-w-[90%] rounded-xl p-2 text-sm ${m.fromStaff ? 'ml-auto bg-[#e3edf7]' : 'bg-[color:var(--color-sand-100)]'}`}>{m.body}<span className="block text-xs text-[color:var(--color-ink-500)]">{formatDateTime(m.createdAt)}</span></li>)}</ul>
          {can(user.role, 'support.reply') && <form action={supportReplyAction.bind(null, c.id, back)} className="mt-2 flex gap-1"><input name="body" className="field" placeholder="Reply" required /><button className="btn btn-secondary btn-sm" type="submit">Send</button></form>}
        </section>
      </div>
    </>
  );
}
