import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatPeso } from '@/lib/money';
import { PageHeader, StatCard, StatusBadge, Alert } from '@/components/ui';
import { saveStockTakeAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function StockTakeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePage('inventory.edit');
  const { id } = await params;

  const take = await prisma.stockTake.findUnique({
    where: { id },
    include: {
      lines: {
        include: { item: { include: { unit: true } } },
        orderBy: { item: { name: 'asc' } },
      },
    },
  });
  if (!take) notFound();

  const closed = take.status === 'CLOSED';
  const variances = take.lines.filter((l) => l.varianceQty !== 0);
  const varianceValue = variances.reduce(
    (a, l) => a + Math.round(l.item.costCents * l.varianceQty),
    0,
  );

  return (
    <div>
      <PageHeader
        title={`Stock-take — ${take.takeDate.toISOString().slice(0, 10)}`}
        subtitle={`Started by ${take.createdBy}`}
        actions={<StatusBadge status={closed ? 'COMPLETED' : 'PENDING'} label={take.status.toLowerCase()} />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Items counted" value={String(take.lines.length)} />
        <StatCard label="Variances" value={String(variances.length)} tone={variances.length ? 'warn' : 'good'} />
        <StatCard
          label="Variance value"
          value={formatPeso(varianceValue)}
          tone={varianceValue < 0 ? 'bad' : varianceValue > 0 ? 'good' : 'default'}
          hint="at cost"
        />
        <StatCard label="Status" value={closed ? 'Closed' : 'Open'} />
      </div>

      {closed && (
        <div className="mb-4">
          <Alert tone="success">
            This count is closed. Stock levels were adjusted to the counted quantities and a
            STOCKTAKE movement was written for each variance.
          </Alert>
        </div>
      )}

      <form action={saveStockTakeAction}>
        <input type="hidden" name="id" value={take.id} />
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">System</th>
                <th className="text-right">Counted</th>
                <th className="text-right">Variance</th>
                <th className="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {take.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.item.name}
                    <span className="block text-[11px] text-moss-400">{l.item.unit.name}</span>
                  </td>
                  <td className="num text-right">{l.systemQty}</td>
                  <td className="text-right">
                    {closed ? (
                      <span className="num">{l.countedQty}</span>
                    ) : (
                      <input
                        name={`counted_${l.id}`}
                        type="number"
                        step="0.01"
                        defaultValue={l.countedQty}
                        className="input w-24 text-right"
                      />
                    )}
                  </td>
                  <td className={`num text-right ${l.varianceQty === 0 ? '' : l.varianceQty < 0 ? 'text-clay-500' : 'text-moss-600'}`}>
                    {l.varianceQty > 0 ? '+' : ''}{l.varianceQty || '—'}
                  </td>
                  <td className="num text-right text-xs text-moss-500">
                    {l.varianceQty ? formatPeso(Math.round(l.item.costCents * l.varianceQty)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!closed && (
          <div className="mt-4 space-y-3">
            <label className="block max-w-lg">
              <span className="label">Notes</span>
              <textarea name="notes" className="textarea" rows={2}
                placeholder="Explain any large variance" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" type="submit" name="close" value="0">
                Save counts
              </button>
              <button className="btn-primary" type="submit" name="close" value="1">
                Close &amp; adjust stock
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
