import { requirePage } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { gatewayMode } from '@/lib/paymongo';
import { PageHeader, Alert } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { SettingsForm } from '@/components/settings-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Online booking settings' };

export default async function BookingSettingsPage() {
  const user = await requirePage('settings.critical');
  const s = await getSettings(user.branchId);
  const mode = gatewayMode();

  return (
    <div>
      <PageHeader title="Online booking" subtitle="Reservation fee, expiry, payment gateway and the manual fallback." />
      <SettingsNav role={user.role} current="/portal/settings/booking" />

      <div className="mb-4 max-w-2xl">
        <Alert tone={mode === 'live' ? 'success' : mode === 'test' ? 'info' : 'warn'}>
          <strong>PayMongo is in {mode} mode.</strong>{' '}
          {mode === 'simulated'
            ? 'No API keys are configured, so bookings use a local simulated checkout page. Set PAYMONGO_SECRET_KEY, PAYMONGO_PUBLIC_KEY and PAYMONGO_WEBHOOK_SECRET in your environment to take real payments.'
            : mode === 'test'
              ? 'Test keys are in use — no real money moves. Switch to sk_live_ keys when you are ready.'
              : 'Live keys are in use. Real payments are being taken.'}
          {' '}Keys live in environment variables, never in the database.
        </Alert>
      </div>

      <div className="max-w-2xl">
        <SettingsForm section="booking">
          <div className="card-pad space-y-3">
            <p className="section-title">Reservation fee</p>
            <label className="flex items-center gap-2 text-sm text-moss-700">
              <input type="checkbox" name="enabled" className="h-5 w-5 accent-[#345a3e]"
                defaultChecked={s['booking.enabled']} />
              Accept online bookings
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Deposit (% of service price)</span>
                <input name="depositPercent" type="number" min={0} max={100} className="input"
                  defaultValue={s['booking.depositPercent']} />
              </label>
              <label className="block">
                <span className="label">Unpaid bookings expire after (minutes)</span>
                <input name="expiryMinutes" type="number" min={15} className="input"
                  defaultValue={s['booking.expiryMinutes']} />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Minimum lead time (minutes)</span>
                <input name="leadTimeMinutes" type="number" min={0} className="input"
                  defaultValue={s['booking.leadTimeMinutes']} />
              </label>
              <label className="block">
                <span className="label">Slot interval (minutes)</span>
                <input name="slotStepMinutes" type="number" min={15} step={15} className="input"
                  defaultValue={s['booking.slotStepMinutes']} />
              </label>
            </div>
            <label className="block">
              <span className="label">If the client cancels or no-shows</span>
              <select name="depositOnCancel" className="select" defaultValue={s['booking.depositOnCancel']}>
                <option value="FORFEIT">Forfeit the deposit (default)</option>
                <option value="REFUND">Refund the deposit</option>
              </select>
            </label>
          </div>

          <div className="card-pad space-y-3">
            <p className="section-title">Manual transfer fallback</p>
            <p className="muted">
              Off by default. When on, visitors pay by GCash or bank transfer and must upload a
              screenshot, which appears instantly on the receptionist&apos;s dashboard for one-tap
              verification.
            </p>
            <label className="flex items-center gap-2 text-sm text-moss-700">
              <input type="checkbox" name="manualFallbackEnabled" className="h-5 w-5 accent-[#345a3e]"
                defaultChecked={s['booking.manualFallbackEnabled']} />
              Use manual transfer instead of the gateway
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">GCash account name</span>
                <input name="gcashName" className="input" defaultValue={s['booking.gcashName']} />
              </label>
              <label className="block">
                <span className="label">GCash number</span>
                <input name="gcashNumber" className="input" defaultValue={s['booking.gcashNumber']} />
              </label>
            </div>
            <label className="block">
              <span className="label">Bank details</span>
              <input name="bankDetails" className="input" defaultValue={s['booking.bankDetails']} />
            </label>
          </div>
        </SettingsForm>
      </div>
    </div>
  );
}
