import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { PageHeader, Field, TextArea, Checkbox } from '@/components/ui';
import { Flash, type FlashParams } from '../flash';
import { saveSettingsAction } from '../actions';

export const dynamic = 'force-dynamic';

const BUSINESS = ['business.name', 'business.tagline', 'business.intro', 'business.email', 'business.phone', 'business.address', 'business.logoUrl', 'business.facebook', 'business.instagram', 'business.invitesCreatedLabel', 'business.rsvpsCollectedLabel', 'site.comingSoon', 'site.demoSlug'];
const CONTACT = ['contact.messenger', 'contact.viber', 'contact.whatsapp', 'contact.hoursNote'];
const PAYMENTS = ['payments.manualEnabled', 'payments.gcashName', 'payments.gcashNumber', 'payments.gcashQrUrl', 'payments.mayaName', 'payments.mayaNumber', 'payments.bankAccounts', 'payments.manualNote', 'orders.unpaidExpiryDays'];
const SERVICE = ['dfy.turnaroundDays', 'dfy.revisions', 'concierge.turnaroundDays', 'concierge.revisions', 'rush.turnaroundHours'];
const POLICY = ['policy.refund', 'policy.privacy'];
const TEMPLATES = ['email.orderReceived', 'email.orderActive', 'email.previewReady', 'email.rsvpReceived', 'sms.rsvpReminder', 'sms.senderName'];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const user = await requireStaffPage('settings.view');
  const sp = await searchParams;
  const s = await getSettings();
  const ro = !can(user.role, 'settings.edit');
  const Save = ({ keys }: { keys: string[] }) => (ro ? null : <button className="btn btn-primary btn-sm" type="submit" formAction={saveSettingsAction.bind(null, keys, '/admin/settings')}>Save</button>);
  return (
    <>
      <PageHeader title="Settings" subtitle="Business details, payment accounts, service levels, policies and message templates." actions={<><Link href="/admin/settings/pricing" className="btn btn-secondary btn-sm">Packages & add-ons</Link>{can(user.role, 'users.manage') && <Link href="/admin/settings/users" className="btn btn-secondary btn-sm">Staff accounts</Link>}{can(user.role, 'audit.view') && <Link href="/admin/settings/audit" className="btn btn-secondary btn-sm">Audit trail</Link>}</>} />
      <Flash {...sp} />
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="card space-y-3 p-4">
          <h2 className="font-semibold">Business</h2>
          <Field label="Name" name="business.name" defaultValue={s['business.name']} />
          <Field label="Tagline" name="business.tagline" defaultValue={s['business.tagline']} />
          <TextArea label="Intro (meta description)" name="business.intro" defaultValue={s['business.intro']} rows={2} />
          <div className="grid grid-cols-2 gap-2"><Field label="Email" name="business.email" defaultValue={s['business.email']} /><Field label="Phone" name="business.phone" defaultValue={s['business.phone']} /></div>
          <Field label="Address" name="business.address" defaultValue={s['business.address']} />
          <Field label="Logo URL" name="business.logoUrl" defaultValue={s['business.logoUrl']} />
          <div className="grid grid-cols-2 gap-2"><Field label="Facebook page" name="business.facebook" defaultValue={s['business.facebook']} /><Field label="Instagram" name="business.instagram" defaultValue={s['business.instagram']} /></div>
          <div className="grid grid-cols-2 gap-2"><Field label="Trust bar: invites created" name="business.invitesCreatedLabel" defaultValue={s['business.invitesCreatedLabel']} placeholder="e.g. 1,200+" /><Field label="Trust bar: RSVPs collected" name="business.rsvpsCollectedLabel" defaultValue={s['business.rsvpsCollectedLabel']} placeholder="e.g. 85,000+" /></div>
          <Field label="Demo invitation slug" name="site.demoSlug" defaultValue={s['site.demoSlug']} />
          <Checkbox label="Coming soon mode (hide the public site)" name="site.comingSoon" defaultChecked={s['site.comingSoon']} />
          <Save keys={BUSINESS} />
        </form>
        <form className="card space-y-3 p-4">
          <h2 className="font-semibold">How customers reach you</h2>
          <Field label="Messenger link" name="contact.messenger" defaultValue={s['contact.messenger']} hint="m.me/yourpage" />
          <Field label="Viber link" name="contact.viber" defaultValue={s['contact.viber']} hint="viber://chat?number=%2B639…" />
          <Field label="WhatsApp link" name="contact.whatsapp" defaultValue={s['contact.whatsapp']} />
          <Field label="Hours note" name="contact.hoursNote" defaultValue={s['contact.hoursNote']} />
          <Save keys={CONTACT} />
        </form>
        <form className="card space-y-3 p-4">
          <h2 className="font-semibold">Manual payment details</h2>
          <Checkbox label="Accept manual transfers with proof of payment" name="payments.manualEnabled" defaultChecked={s['payments.manualEnabled']} />
          <div className="grid grid-cols-2 gap-2"><Field label="GCash name" name="payments.gcashName" defaultValue={s['payments.gcashName']} /><Field label="GCash number" name="payments.gcashNumber" defaultValue={s['payments.gcashNumber']} /></div>
          <Field label="GCash QR image URL" name="payments.gcashQrUrl" defaultValue={s['payments.gcashQrUrl']} />
          <div className="grid grid-cols-2 gap-2"><Field label="Maya name" name="payments.mayaName" defaultValue={s['payments.mayaName']} /><Field label="Maya number" name="payments.mayaNumber" defaultValue={s['payments.mayaNumber']} /></div>
          <p className="label">Bank accounts</p>
          {Array.from({ length: 4 }, (_, i) => s['payments.bankAccounts'][i] ?? { bank: '', name: '', number: '' }).map((b, i) => (
            <div key={i} className="grid grid-cols-3 gap-2"><input name={`bank_${i}`} defaultValue={b.bank} placeholder="Bank" className="field" /><input name={`bankName_${i}`} defaultValue={b.name} placeholder="Account name" className="field" /><input name={`bankNumber_${i}`} defaultValue={b.number} placeholder="Account number" className="field" /></div>
          ))}
          <input type="hidden" name="payments.bankAccounts" value="rows" />
          <TextArea label="Note shown to customers" name="payments.manualNote" defaultValue={s['payments.manualNote']} rows={2} />
          <Field label="Cancel unpaid orders after (days)" name="orders.unpaidExpiryDays" type="number" defaultValue={s['orders.unpaidExpiryDays']} />
          <Save keys={PAYMENTS} />
        </form>
        <form className="card space-y-3 p-4">
          <h2 className="font-semibold">Service levels</h2>
          <div className="grid grid-cols-2 gap-2">
            <Field label="DFY turnaround (working days)" name="dfy.turnaroundDays" type="number" defaultValue={s['dfy.turnaroundDays']} />
            <Field label="DFY revision rounds" name="dfy.revisions" type="number" defaultValue={s['dfy.revisions']} />
            <Field label="Concierge turnaround (days)" name="concierge.turnaroundDays" type="number" defaultValue={s['concierge.turnaroundDays']} />
            <Field label="Concierge revision rounds" name="concierge.revisions" type="number" defaultValue={s['concierge.revisions']} />
            <Field label="Rush publish (hours)" name="rush.turnaroundHours" type="number" defaultValue={s['rush.turnaroundHours']} />
          </div>
          <Save keys={SERVICE} />
          <h2 className="pt-2 font-semibold">Policies</h2>
          <TextArea label="Refund policy" name="policy.refund" defaultValue={s['policy.refund']} rows={3} />
          <TextArea label="Privacy statement" name="policy.privacy" defaultValue={s['policy.privacy']} rows={3} />
          <Save keys={POLICY} />
        </form>
        <form className="card space-y-3 p-4 lg:col-span-2">
          <h2 className="font-semibold">Message templates</h2>
          <p className="text-xs text-[color:var(--color-ink-500)]">Placeholders: {'{{customerName}} {{reference}} {{packageName}} {{total}} {{status}} {{nextStep}} {{previewUrl}} {{revisionsLeft}} {{guestName}} {{invitationTitle}} {{response}} {{seats}} {{invitationId}} {{hosts}} {{eventDate}} {{link}} {{businessName}} {{messenger}} {{appUrl}}'}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <TextArea label="Email: order received" name="email.orderReceived" defaultValue={s['email.orderReceived']} rows={6} />
            <TextArea label="Email: payment confirmed" name="email.orderActive" defaultValue={s['email.orderActive']} rows={6} />
            <TextArea label="Email: DFY preview ready" name="email.previewReady" defaultValue={s['email.previewReady']} rows={6} />
            <TextArea label="Email: RSVP received" name="email.rsvpReceived" defaultValue={s['email.rsvpReceived']} rows={6} />
            <TextArea label="SMS: RSVP reminder" name="sms.rsvpReminder" defaultValue={s['sms.rsvpReminder']} rows={3} hint="Every character counts: one credit covers 160 plain characters, but a single emoji drops that to 70." />
            <Field label="SMS sender name" name="sms.senderName" defaultValue={s['sms.senderName']} hint="Registered with Semaphore. Leave blank to use the account default." />
          </div>
          <Save keys={TEMPLATES} />
        </form>
      </div>
    </>
  );
}
