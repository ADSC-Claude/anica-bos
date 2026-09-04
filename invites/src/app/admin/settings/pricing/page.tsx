import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { occasionLabel } from '@/lib/occasions';
import { PageHeader, BackLink, Field, Checkbox } from '@/components/ui';
import { Flash, type FlashParams } from '../../flash';
import { savePackageAction, saveAddOnAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function PricingPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  await requireStaffPage('settings.edit');
  const sp = await searchParams;
  const [packages, addOns] = await Promise.all([prisma.package.findMany({ orderBy: [{ occasion: 'asc' }, { sortOrder: 'asc' }] }), prisma.addOn.findMany({ orderBy: { sortOrder: 'asc' } })]);
  const back = '/admin/settings/pricing';
  return (
    <>
      <BackLink href="/admin/settings">Settings</BackLink>
      <PageHeader title="Packages & add-ons" subtitle="Prices in pesos. Orders already placed keep the price they were placed at. A row with no occasion is the fallback for occasions without their own." />
      <Flash {...sp} />
      <div className="card overflow-x-auto">
        <table className="data">
          <thead><tr><th>Package</th><th>Name / tagline</th><th>Price ₱</th><th>+ DFY ₱</th><th>+ Concierge ₱</th><th>Edits (-1 = ∞)</th><th>Validity days</th><th>Active</th><th /></tr></thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.id}>
                <td className="text-xs"><b>{p.occasion ? occasionLabel(p.occasion) : 'Any occasion'}</b><br />{p.tier}<br /><code>{p.code}</code></td>
                <td><form id={`pkg-${p.id}`} action={savePackageAction.bind(null, p.id, back)} /><input form={`pkg-${p.id}`} name="name" defaultValue={p.name} className="field" /><input form={`pkg-${p.id}`} name="tagline" defaultValue={p.tagline} className="field mt-1 text-xs" /></td>
                <td><input form={`pkg-${p.id}`} name="price" type="number" step="0.01" defaultValue={p.priceCents / 100} className="field w-24" /></td>
                <td><input form={`pkg-${p.id}`} name="dfyFee" type="number" step="0.01" defaultValue={p.dfyFeeCents / 100} className="field w-24" /></td>
                <td><input form={`pkg-${p.id}`} name="conciergeFee" type="number" step="0.01" defaultValue={p.conciergeFeeCents / 100} className="field w-24" /></td>
                <td><input form={`pkg-${p.id}`} name="edits" type="number" defaultValue={p.editsAfterPublish} className="field w-20" /></td>
                <td><input form={`pkg-${p.id}`} name="validity" type="number" defaultValue={p.linkValidityDays} className="field w-20" /></td>
                <td><input form={`pkg-${p.id}`} name="active" type="checkbox" defaultChecked={p.active} className="h-4 w-4" /></td>
                <td><button form={`pkg-${p.id}`} className="btn btn-secondary btn-sm" type="submit">Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-8 mb-2 font-semibold">Add-ons</h2>
      <div className="card overflow-x-auto">
        <table className="data">
          <thead><tr><th>Code</th><th>Name / description</th><th>Price ₱</th><th>Quoted</th><th>Active</th><th>Order</th><th /></tr></thead>
          <tbody>
            {[...addOns, null].map((a, i) => {
              const fid = `addon-${a?.id ?? 'new'}`;
              return (
                <tr key={a?.id ?? 'new'}>
                  <td><form id={fid} action={saveAddOnAction.bind(null, a?.id ?? null, back)} /><input form={fid} name="code" defaultValue={a?.code} placeholder="NEW_CODE" className="field w-36 font-mono text-xs" /></td>
                  <td><input form={fid} name="name" defaultValue={a?.name} placeholder="Name" className="field" /><input form={fid} name="description" defaultValue={a?.description} placeholder="Description" className="field mt-1 text-xs" /></td>
                  <td><input form={fid} name="price" type="number" step="0.01" defaultValue={a ? a.priceCents / 100 : 0} className="field w-24" /></td>
                  <td><input form={fid} name="quoted" type="checkbox" defaultChecked={a?.quoted ?? true} className="h-4 w-4" title="Untick for 'ask us' pricing" /></td>
                  <td><input form={fid} name="active" type="checkbox" defaultChecked={a?.active ?? true} className="h-4 w-4" /></td>
                  <td><input form={fid} name="sortOrder" type="number" defaultValue={a?.sortOrder ?? i} className="field w-16" /></td>
                  <td><button form={fid} className="btn btn-secondary btn-sm" type="submit">{a ? 'Save' : 'Add'}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
