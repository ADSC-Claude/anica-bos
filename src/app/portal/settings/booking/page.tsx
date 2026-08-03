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
            ? 'No API key is configured, so bookings use a local simulated checkout page. Set PAYMONGO_SECRET_KEY and PAYMONGO_WEBHOOK_SECRET in your environment to take real payments. The public key is not used here — everything happens server-side.'
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
            <label className="flex items-center gap-2 text-sm text-cocoa-700">
              <input type="checkbox" name="enabled" className="h-5 w-5 accent-[#6b4e35]"
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
                <span className="mt-1 block text-[11px] text-cocoa-400">
                  How far apart start times are offered. 15 gives 8:00, 8:15, 8:30…
                </span>
              </label>
            </div>
            <label className="block">
              <span className="label">Changeover between treatments (minutes)</span>
              <input name="changeoverMinutes" type="number" min={0} step={5} className="input"
                defaultValue={s['booking.changeoverMinutes']} />
              <span className="mt-1 block text-[11px] text-cocoa-400">
                Time left free between two treatments in the same visit — the shower after a
                sauna, the consultation and foot soak before a massage, the therapist setting up.
                A sauna at 1:30 followed by an hour&rsquo;s massage finishes at 3:20 with 20
                minutes here, not at 3:00. Booking them back to back quotes a finish time you
                cannot hit. A treatment that needs longer can override this in{' '}
                <a href="/portal/settings/services" className="underline underline-offset-2">
                  Services
                </a>.
              </span>
            </label>
            <label className="block">
              <span className="label">Last call — request window before closing (minutes)</span>
              <input name="lastCallMinutes" type="number" min={0} step={15} className="input"
                defaultValue={s['booking.lastCallMinutes']} />
              <span className="mt-1 block text-[11px] text-cocoa-400">
                A treatment that finishes before closing is booked outright. Inside this window a
                longer treatment can still be <strong>requested</strong> — it arrives for you to
                approve or decline, since it means someone stays late. Nothing is charged until
                you approve, so declining never means a refund. 60 with a midnight close means
                requests are taken up to 11:00 PM. Set 0 to switch requests off.
              </span>
            </label>
            <label className="block">
              <span className="label">Cancellation notice required (hours)</span>
              <input name="cancellationHours" type="number" min={0} className="input"
                defaultValue={s['booking.cancellationHours']} />
              <span className="mt-1 block text-[11px] text-cocoa-400">
                How much warning you need to resell the hour to somebody else the same day.
                Cancel earlier than this and the rule below applies; cancel inside it, or
                simply not turn up, and the reservation fee is kept. 0 switches the deadline
                off, so any cancellation counts as in time.
              </span>
            </label>
            <label className="block">
              <span className="label">If the client cancels in time</span>
              <select name="depositOnCancel" className="select" defaultValue={s['booking.depositOnCancel']}>
                <option value="REFUND">Refund the reservation fee</option>
                <option value="FORFEIT">Keep it anyway — never refundable</option>
              </select>
              <span className="mt-1 block text-[11px] text-cocoa-400">
                A late cancellation and a no-show always forfeit, whichever you pick here.
                Whatever you choose is what the booking form promises the guest before she
                pays, so the two can never disagree.
              </span>
            </label>
          </div>

          <div className="card-pad space-y-3">
            <p className="section-title">Manual transfer fallback</p>
            <p className="muted">
              Off by default. When on, visitors pay by GCash or bank transfer and must upload a
              screenshot, which appears instantly on the receptionist&apos;s dashboard for one-tap
              verification.
            </p>
            <label className="flex items-center gap-2 text-sm text-cocoa-700">
              <input type="checkbox" name="manualFallbackEnabled" className="h-5 w-5 accent-[#6b4e35]"
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
              <textarea name="bankDetails" className="textarea" rows={3}
                defaultValue={s['booking.bankDetails']} />
              <span className="mt-1 block text-[11px] text-cocoa-400">
                One account per line — the guest sees them as a list and picks whichever bank
                she has. e.g. <code>BDO • ANICA Wellness Spa • 1234 5678 9012</code>
              </span>
            </label>
          </div>
        </SettingsForm>
      </div>
    </div>
  );
}
