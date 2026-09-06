import { requireStaffPage } from '@/lib/guard';
import { salesReport, dfyReport, templateReport } from '@/lib/reports';
import { ratio } from '@/lib/money';
import { PageHeader, Stat, Money, Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

function Table({ title, rows }: { title: string; rows: { key: string; label: string; orders: number; revenueCents: number }[] }) {
  return (
    <Card title={title}>
      <table className="data"><thead><tr><th>{title.replace('By ', '')}</th><th>Orders</th><th>Revenue</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.key}><td>{r.label}</td><td>{r.orders}</td><td><Money cents={r.revenueCents} /></td></tr>)}{rows.length === 0 && <tr><td colSpan={3} className="text-[color:var(--color-ink-500)]">No paid orders yet.</td></tr>}</tbody></table>
    </Card>
  );
}

export default async function ReportsPage() {
  await requireStaffPage('reports.view');
  const [sales, dfy, templates] = await Promise.all([salesReport(12), dfyReport(), templateReport()]);
  return (
    <>
      <PageHeader title="Reports" subtitle="Last 12 months. Revenue is paid orders net of refunds." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Revenue" value={<Money cents={sales.totalCents} short />} />
        <Stat label="Paid orders" value={sales.orders} />
        <Stat label="Conversion" value={`${ratio(sales.conversion.paid, sales.conversion.created)}%`} hint={`${sales.conversion.paid} paid of ${sales.conversion.created} placed`} />
        <Stat label="DFY intake → preview" value={`${dfy.avgIntakeToPreviewHours} h`} hint={`avg over ${dfy.sampled} jobs · ${dfy.lateCount} late · ${dfy.avgRevisions} revisions avg`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Table title="By month" rows={sales.byMonth} />
        <Table title="By package" rows={sales.byPackage} />
        <Table title="By occasion" rows={sales.byOccasion} />
        <Table title="By service mode" rows={sales.byMode} />
        <Table title="By tier" rows={sales.byTier} />
        <Table title="By payment channel" rows={sales.byChannel} />
        <Card title="Template popularity">
          <table className="data"><thead><tr><th>Template</th><th>Occasion</th><th>Invitations</th></tr></thead><tbody>{templates.map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.occasion}</td><td>{t.count}</td></tr>)}</tbody></table>
        </Card>
        <Card title="DFY queue by status">
          <table className="data"><tbody>{Object.entries(dfy.open).map(([k, v]) => <tr key={k}><td>{k.toLowerCase().replace(/_/g, ' ')}</td><td>{v}</td></tr>)}</tbody></table>
        </Card>
      </div>
    </>
  );
}
