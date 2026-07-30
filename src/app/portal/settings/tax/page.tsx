import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import { PageHeader, Alert } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { SettingsForm } from '@/components/settings-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tax & BIR settings' };

export default async function TaxSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const user = await requirePage('settings.critical');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const s = await getSettings(branchId);
  const series = await prisma.receiptSeries.findMany({ where: { branchId } });

  return (
    <div>
      <PageHeader title="Tax &amp; BIR" subtitle="Tax regime, receipt notation and the receipt series." />
      <SettingsNav role={user.role} current="/portal/settings/tax" />

      <div className="mb-4 max-w-2xl">
        <Alert tone="warn">
          This is a <strong>record-keeping system, not yet a BIR-accredited CAS</strong> and not a
          filing system. It is built so it can be accredited later with minimal rework: gapless
          immutable receipt numbering, no hard deletes, a full audit trail, standard journals and
          10-year retention. Nothing is ever transmitted to the BIR or any third party.
        </Alert>
      </div>

      <div className="max-w-2xl space-y-6">
        <SettingsForm section="tax">
          <div className="card-pad space-y-3">
            <label className="block">
              <span className="label">Tax regime</span>
              <select name="regime" className="select" defaultValue={s['tax.regime']}>
                <option value="NON_VAT_8">Non-VAT — 8% income tax option (current registration)</option>
                <option value="VAT_REGISTERED">VAT-registered</option>
              </select>
              <span className="mt-1 block text-[11px] text-moss-400">
                Switching reformats receipts and journals immediately. The VAT fields already
                exist on every record, so no migration is needed.
              </span>
            </label>
            <label className="block">
              <span className="label">VAT rate (%)</span>
              <input name="vatPercent" type="number" min={0} max={30} className="input"
                defaultValue={s['tax.vatPercent']} />
            </label>
            <label className="block">
              <span className="label">Non-VAT receipt notation</span>
              <textarea name="nonVatNotice" className="textarea" rows={2}
                defaultValue={s['tax.nonVatNotice']} />
            </label>
            <label className="flex items-center gap-2 text-sm text-moss-700">
              <input type="checkbox" name="casAccredited" className="h-5 w-5 accent-[#345a3e]"
                defaultChecked={s['tax.casAccredited']} />
              This system is now BIR-accredited (hides the &ldquo;not yet accredited&rdquo; notice
              on receipts)
            </label>
          </div>
        </SettingsForm>

        <div className="card-pad">
          <h2 className="section-title mb-2">Receipt series</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>Series</th>
                <th>Prefix</th>
                <th>ATP / permit</th>
                <th className="text-right">Range</th>
                <th className="text-right">Next</th>
              </tr>
            </thead>
            <tbody>
              {series.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="num">{r.prefix}</td>
                  <td className="text-xs text-moss-500">{r.permitNumber || '—'}</td>
                  <td className="num text-right">{r.rangeStart}–{r.rangeEnd}</td>
                  <td className="num text-right">{r.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-moss-400">
            The VAT registration threshold is {formatPeso(s['tax.vatThresholdCents'])} of gross
            sales per year — the P&amp;L page tracks how close you are.
          </p>
        </div>
      </div>
    </div>
  );
}
