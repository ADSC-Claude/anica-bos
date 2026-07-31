import { requirePage } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { minutesToLabel } from '@/lib/datetime';
import { PageHeader } from '@/components/ui';
import { SettingsNav, SettingsIndexCards } from '@/components/settings-nav';
import { SettingsForm } from '@/components/settings-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requirePage('settings.view');
  const s = await getSettings(user.branchId);

  return (
    <div>
      <PageHeader title="Settings" subtitle="Everything in this system is configurable here." />
      <SettingsNav role={user.role} current="/portal/settings" />

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="max-w-2xl">
          <h2 className="section-title mb-3">Business profile</h2>
          <SettingsForm section="business">
            <div className="card-pad space-y-3">
              <label className="block">
                <span className="label">Business name</span>
                <input name="name" className="input" defaultValue={s['business.name']} />
              </label>
              <label className="block">
                <span className="label">Tagline (landing page hero)</span>
                <input name="tagline" className="input" defaultValue={s['business.tagline']} />
              </label>
              <label className="block">
                <span className="label">Address</span>
                <input name="address" className="input" defaultValue={s['business.address']} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Contact number</span>
                  <input name="contact" className="input" defaultValue={s['business.contact']} />
                </label>
                <label className="block">
                  <span className="label">Public email</span>
                  <input name="email" type="email" className="input" defaultValue={s['business.email']} />
                </label>
              </div>
              <label className="block">
                <span className="label">Facebook page</span>
                <input name="facebook" className="input" defaultValue={s['business.facebook']} />
              </label>
              <label className="block">
                <span className="label">Map for the landing page</span>
                <input name="mapEmbedUrl" className="input" defaultValue={s['business.mapEmbedUrl']}
                  placeholder="Paste the Google Maps embed code or URL" />
                <span className="mt-1 block text-[11px] text-cocoa-400">
                  In Google Maps: Share → <strong>Embed a map</strong> → Copy HTML. Paste the
                  whole thing — the address is picked out for you. Share → Send a link gives
                  a different kind of link that will not display.
                </span>
              </label>
              <label className="block">
                <span className="label">Logo URL</span>
                <input name="logoUrl" className="input" defaultValue={s['business.logoUrl']} />
              </label>
              <label className="block">
                <span className="label">TIN (printed on receipts)</span>
                <input name="tin" className="input" defaultValue={s['business.tin']} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Opens at (minutes past midnight)</span>
                  <input name="openMinute" type="number" min={0} max={1440} className="input"
                    defaultValue={s['business.openMinute']} />
                  <span className="mt-1 block text-[11px] text-cocoa-400">
                    {minutesToLabel(s['business.openMinute'])} — 720 = 12 noon
                  </span>
                </label>
                <label className="block">
                  <span className="label">Closes at</span>
                  <input name="closeMinute" type="number" min={0} max={1440} className="input"
                    defaultValue={s['business.closeMinute']} />
                  <span className="mt-1 block text-[11px] text-cocoa-400">
                    {minutesToLabel(s['business.closeMinute'])} — 1440 = midnight
                  </span>
                </label>
              </div>
              <label className="block">
                <span className="label">Receipt footer</span>
                <input name="receiptFooter" className="input" defaultValue={s['business.receiptFooter']} />
              </label>
              <p className="text-[11px] text-cocoa-400">
                Timezone is fixed to Asia/Manila and currency to PHP (₱).
              </p>
            </div>
          </SettingsForm>
        </div>

        <div>
          <h2 className="section-title mb-3">All settings</h2>
          <SettingsIndexCards role={user.role} />
        </div>
      </div>
    </div>
  );
}
