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
              <label className="block">
                <span className="label">City</span>
                <input name="locality" className="input" defaultValue={s['business.locality']} />
                <span className="muted mt-1 block text-xs">
                  Used in sentences on the landing page — &ldquo;Most spas in{' '}
                  {s['business.locality']} have locked up by the time you finish work.&rdquo;
                </span>
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
              <fieldset className="rounded-xl border border-sand-200 p-3">
                <legend className="label px-1">Google reviews</legend>
                <p className="muted mb-3 text-xs">
                  Typed in, not fetched. The landing page shows this score under the guest
                  quotes and links to the listing, so the quotes you choose sit next to the
                  average everybody can check. Leave blank to hide the line.
                </p>
                <label className="block">
                  <span className="label">Listing link</span>
                  <input name="googleUrl" className="input" defaultValue={s['business.googleUrl']} />
                </label>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">Rating</span>
                    <input
                      name="googleRating"
                      className="input"
                      placeholder="4.9"
                      defaultValue={s['business.googleRating']}
                    />
                  </label>
                  <label className="block">
                    <span className="label">Number of reviews</span>
                    <input
                      name="googleReviewCount"
                      type="number"
                      min={0}
                      className="input"
                      defaultValue={s['business.googleReviewCount']}
                    />
                  </label>
                </div>
              </fieldset>
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
                <span className="label">Logo</span>
                <input name="logoUrl" className="input" defaultValue={s['business.logoUrl']}
                  placeholder="/logo.png" />
                <span className="mt-1 block text-[11px] text-cocoa-400">
                  Shown in the website header, on the sign-in screen and in this system&apos;s
                  sidebar. It sits inside the brown tile, so the artwork needs to be{' '}
                  <strong>white or gold on a transparent background</strong> — a dark logo will
                  disappear. Square PNG or SVG, 256px or larger. Upload it to the
                  repository&apos;s <code>public</code> folder and enter <code>/logo.png</code>.
                  Leave blank for the ✿ mark.
                </span>
              </label>
              <label className="block">
                <span className="label">Photo or video on the landing page</span>
                <input
                  name="heroImageUrl"
                  className="input"
                  defaultValue={s['business.heroImageUrl']}
                  placeholder="/hero.jpg"
                />
                <span className="mt-1 block text-[11px] text-cocoa-400">
                  Your reception or a treatment room. Upload the file to the
                  repository&apos;s <code>public</code> folder and enter{' '}
                  <code>/hero.jpg</code>, or paste a full https:// link. A{' '}
                  <code>.mp4</code>, <code>.webm</code> or <code>.mov</code> plays as a
                  silent loop; anything else is shown as a photo. Portrait suits the frame —
                  it is a tall arch. Leave blank for the placeholder.
                </span>
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
