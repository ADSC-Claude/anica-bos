import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { manilaMonthKey, formatMonthKey } from '@/lib/datetime';
import { PageHeader } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { KpiTargetForm } from './form';
import { KPI_DEFS } from './defs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'KPI targets' };



export default async function KpiSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requirePage('settings.edit');
  const params = await searchParams;
  const monthKey = params.month ?? manilaMonthKey();
  const targets = await prisma.kpiTarget.findMany({ where: { periodKey: monthKey } });
  const byKey = new Map(targets.map((t) => [t.key, t.target]));

  return (
    <div>
      <PageHeader
        title="KPI targets"
        subtitle={`Monthly goals for ${formatMonthKey(monthKey)}. The scorecard shows green, amber or red against these.`}
        actions={
          <form className="flex gap-2" action="/portal/settings/kpi">
            <input type="month" name="month" defaultValue={monthKey} className="input w-auto" />
            <button className="btn-secondary btn-sm" type="submit">Go</button>
          </form>
        }
      />
      <SettingsNav role={user.role} current="/portal/settings/kpi" />

      <div className="max-w-2xl">
        <KpiTargetForm
          periodKey={monthKey}
          rows={KPI_DEFS.map((d) => ({
            key: d.key,
            label: d.label,
            format: d.format,
            value:
              byKey.get(d.key) === undefined
                ? ''
                : String(
                    d.format === 'money'
                      ? (byKey.get(d.key) ?? 0) / 100
                      : d.format === 'rating'
                        ? (byKey.get(d.key) ?? 0) / 10
                        : byKey.get(d.key),
                  ),
          }))}
        />
      </div>
    </div>
  );
}
