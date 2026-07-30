import { requirePage } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { suggestBusinessThreshold } from '@/lib/retention';
import { PageHeader, Alert } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { SettingsForm } from '@/components/settings-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Operations settings' };

export default async function OperationsSettingsPage() {
  const user = await requirePage('settings.edit');
  const s = await getSettings(user.branchId);
  const suggested = user.branchId ? await suggestBusinessThreshold([user.branchId]) : null;

  return (
    <div>
      <PageHeader title="Operations" subtitle="POS behaviour, loyalty, rotation, retention and memberships." />
      <SettingsNav role={user.role} current="/portal/settings/operations" />

      <div className="max-w-2xl">
        <SettingsForm section="operations">
          <div className="card-pad space-y-3">
            <p className="section-title">Point of sale</p>
            <label className="block">
              <span className="label">Manual discount approval threshold (%)</span>
              <input name="discountApprovalPercent" type="number" min={0} max={100} className="input"
                defaultValue={s['pos.discountApprovalPercent']} />
              <span className="mt-1 block text-[11px] text-moss-400">
                Manual discounts above this need an Owner/Manager PIN at checkout.
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-moss-700">
              <input type="checkbox" name="tipsEnabled" className="h-5 w-5 accent-[#345a3e]"
                defaultChecked={s['pos.tipsEnabled']} />
              Allow tips at checkout
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Petty cash opening float (₱)</span>
                <input name="pettyCashFloat" type="number" step="0.01" className="input"
                  defaultValue={s['pos.pettyCashFloatCents'] / 100} />
              </label>
              <label className="block">
                <span className="label">Replenish when below (₱)</span>
                <input name="pettyCashMinimum" type="number" step="0.01" className="input"
                  defaultValue={s['pos.pettyCashMinimumCents'] / 100} />
              </label>
            </div>
          </div>

          <div className="card-pad space-y-3">
            <p className="section-title">Loyalty</p>
            <label className="flex items-center gap-2 text-sm text-moss-700">
              <input type="checkbox" name="loyaltyEnabled" className="h-5 w-5 accent-[#345a3e]"
                defaultChecked={s['loyalty.enabled']} />
              Award loyalty points
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Pesos spent per point</span>
                <input name="pesosPerPoint" type="number" min={1} className="input"
                  defaultValue={s['loyalty.pesosPerPoint']} />
              </label>
              <label className="block">
                <span className="label">Each point is worth (₱)</span>
                <input name="pointValue" type="number" step="0.01" min={0} className="input"
                  defaultValue={s['loyalty.pointValueCents'] / 100} />
              </label>
            </div>
          </div>

          <div className="card-pad space-y-3">
            <p className="section-title">Rotation &amp; retention</p>
            <label className="block">
              <span className="label">Walk-in rotation rule</span>
              <select name="rotationRule" className="select" defaultValue={s['rotation.rule']}>
                <option value="TIME_IN_ROUND_ROBIN">Time-in order, then round-robin</option>
                <option value="LEAST_BOOKED">Fewest sessions today first</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Flag a client as lapsed after (days)</span>
              <input name="retentionThresholdDays" type="number" min={7} className="input"
                defaultValue={s['retention.defaultThresholdDays']} />
              <span className="mt-1 block text-[11px] text-moss-400">
                Each client is also judged against twice their own average gap between visits.
              </span>
            </label>
            {suggested !== null && suggested !== s['retention.defaultThresholdDays'] && (
              <Alert tone="info">
                Based on your actual visit intervals, <strong>{suggested} days</strong> would fit
                your client base better than the current {s['retention.defaultThresholdDays']}.
              </Alert>
            )}
            <label className="flex items-center gap-2 text-sm text-moss-700">
              <input type="checkbox" name="autoDeductRecipes" className="h-5 w-5 accent-[#345a3e]"
                defaultChecked={s['inventory.autoDeductRecipes']} />
              Auto-deduct consumables from service recipes at checkout
            </label>
          </div>

          <div className="card-pad space-y-3">
            <p className="section-title">Membership</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Membership validity (days)</span>
                <input name="membershipValidityDays" type="number" min={30} className="input"
                  defaultValue={s['membership.validityDays']} />
              </label>
              <label className="block">
                <span className="label">Expiry alert lead time (days)</span>
                <input name="membershipExpiryAlertDays" type="number" min={1} className="input"
                  defaultValue={s['membership.expiryAlertDays']} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-moss-700">
              <input type="checkbox" name="birthdayPerkEnabled" className="h-5 w-5 accent-[#345a3e]"
                defaultChecked={s['membership.birthdayPerkEnabled']} />
              Members get a free service during their birthday month
            </label>
            <p className="text-[11px] text-moss-400">
              Choose which service the perk covers on the membership package in Marketing →
              Packages.
            </p>
          </div>
        </SettingsForm>
      </div>
    </div>
  );
}
