import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatDate } from '@/lib/datetime';
import { formatPeso } from '@/lib/money';
import { PageHeader, Field, Select, Checkbox } from '@/components/ui';
import { Flash, type FlashParams } from '../flash';
import { saveCouponAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CouponsPage({ searchParams }: { searchParams: Promise<FlashParams & { edit?: string }> }) {
  await requireStaffPage('coupons.manage');
  const sp = await searchParams;
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  const editing = sp.edit ? coupons.find((c) => c.id === sp.edit) ?? null : null;
  return (
    <>
      <PageHeader title="Promos & coupons" subtitle="A code is a percent or a peso amount off the whole order, with an expiry and a usage limit." />
      <Flash {...sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-x-auto"><table className="data">
          <thead><tr><th>Code</th><th>Discount</th><th>Min spend</th><th>Used</th><th>Expires</th><th>Active</th><th /></tr></thead>
          <tbody>{coupons.map((c) => <tr key={c.id}><td className="font-mono">{c.code}<span className="block text-xs font-sans text-[color:var(--color-ink-500)]">{c.note}</span></td><td>{c.type === 'PERCENT' ? `${c.value}%` : formatPeso(c.value)}</td><td>{c.minSpendCents ? formatPeso(c.minSpendCents) : '—'}</td><td>{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td><td className="text-xs">{c.expiresAt ? formatDate(c.expiresAt, 'short') : '—'}</td><td>{c.active ? '✓' : '—'}</td><td><a href={`/admin/coupons?edit=${c.id}`} className="underline">Edit</a></td></tr>)}</tbody>
        </table></div>
        <form action={saveCouponAction.bind(null, editing?.id ?? null, '/admin/coupons')} className="card space-y-3 p-4">
          <h2 className="font-semibold">{editing ? `Edit ${editing.code}` : 'New coupon'}</h2>
          <Field label="Code" name="code" defaultValue={editing?.code} required placeholder="LAUNCH20" />
          <Select label="Type" name="type" defaultValue={editing?.type ?? 'PERCENT'} options={[{ value: 'PERCENT', label: 'Percent off' }, { value: 'FIXED', label: 'Pesos off' }]} />
          <Field label="Value (percent, or pesos)" name="value" type="number" step="0.01" defaultValue={editing ? (editing.type === 'PERCENT' ? editing.value : editing.value / 100) : 10} required />
          <Field label="Minimum spend (₱)" name="minSpend" type="number" step="0.01" defaultValue={editing ? editing.minSpendCents / 100 : 0} />
          <Field label="Expires" name="expiresAt" type="date" defaultValue={editing?.expiresAt ? editing.expiresAt.toISOString().slice(0, 10) : ''} />
          <Field label="Usage limit" name="usageLimit" type="number" defaultValue={editing?.usageLimit ?? ''} hint="Blank for unlimited." />
          <Field label="Note" name="note" defaultValue={editing?.note} placeholder="Where it was given out" />
          <Checkbox label="Active" name="active" defaultChecked={editing?.active ?? true} />
          <div className="flex gap-2"><button className="btn btn-primary" type="submit">Save</button>{editing && <a href="/admin/coupons" className="btn btn-secondary">New instead</a>}</div>
        </form>
      </div>
    </>
  );
}
