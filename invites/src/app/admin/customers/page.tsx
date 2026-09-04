import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, Empty } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaffPage('customers.view');
  const { q } = await searchParams;
  const customers = await prisma.user.findMany({
    where: { role: 'CUSTOMER', ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {}) },
    include: { _count: { select: { orders: true, invitations: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Customers" subtitle={`${customers.length} shown`} />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Name, email or phone" className="field max-w-xs" /><button className="btn btn-secondary" type="submit">Search</button></form>
      {customers.length === 0 ? <Empty>No customers match.</Empty> : (
        <div className="card overflow-x-auto"><table className="data">
          <thead><tr><th>Name</th><th>Contact</th><th>Invitations</th><th>Orders</th><th>Joined</th><th>Status</th></tr></thead>
          <tbody>{customers.map((c) => <tr key={c.id}><td><Link href={`/admin/customers/${c.id}`} className="underline">{c.name}</Link></td><td className="text-xs">{c.email}{c.phone && <><br />{c.phone}</>}</td><td>{c._count.invitations}</td><td>{c._count.orders}</td><td className="text-xs">{formatDateTime(c.createdAt)}</td><td>{c.active ? '' : <span className="pill pill-bad">Disabled</span>}</td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}
