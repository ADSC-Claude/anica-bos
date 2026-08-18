import { requirePage } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { getTemplate, type TemplateKey } from '@/lib/email';
import { PageHeader, Alert } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { SettingsForm } from '@/components/settings-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email & SMS settings' };

const TEMPLATES: { key: TemplateKey; label: string }[] = [
  { key: 'booking_received', label: 'Booking received (deposit instructions)' },
  { key: 'booking_confirmed', label: 'Payment confirmed / booking confirmed' },
  { key: 'booking_rejected', label: 'Rejection or expiry notice' },
  { key: 'membership_expiring', label: 'Membership renewal reminder' },
  { key: 'birthday_greeting', label: 'Birthday greeting' },
  { key: 'visit_thank_you', label: 'Thank you after a visit (asks for a Google review)' },
];

export default async function CommsSettingsPage() {
  const user = await requirePage('settings.edit');
  const s = await getSettings(user.branchId);
  const templates = await Promise.all(
    TEMPLATES.map(async (t) => ({ ...t, ...(await getTemplate(t.key)) })),
  );

  return (
    <div>
      <PageHeader title="Email &amp; SMS" subtitle="Transactional templates, automatic greetings and the optional SMS gateway." />
      <SettingsNav role={user.role} current="/portal/settings/comms" />

      <div className="mb-4 max-w-3xl">
        <Alert tone="info">
          Email is sent through Resend. Set <code>RESEND_API_KEY</code> and{' '}
          <code>EMAIL_FROM</code> in your environment — without a key, messages are written to the
          server log and recorded in the email log instead of being sent, so nothing breaks in
          development. SMS needs a Semaphore API key and costs per message.
        </Alert>
      </div>

      <div className="max-w-3xl">
        <SettingsForm section="comms">
          <div className="card-pad space-y-3">
            <p className="section-title">Channels</p>
            <label className="flex items-center gap-2 text-sm text-cocoa-700">
              <input type="checkbox" name="emailEnabled" className="h-5 w-5 accent-[#6b4e35]"
                defaultChecked={s['email.enabled']} />
              Send transactional emails
            </label>
            <label className="block">
              <span className="label">Sender name</span>
              <input name="senderName" className="input" defaultValue={s['email.senderName']} />
            </label>
            <label className="flex items-center gap-2 text-sm text-cocoa-700">
              <input type="checkbox" name="birthdayGreetingEnabled" className="h-5 w-5 accent-[#6b4e35]"
                defaultChecked={s['email.birthdayGreetingEnabled']} />
              Send automatic birthday greetings (daily job)
            </label>
            <label className="flex items-center gap-2 text-sm text-cocoa-700">
              <input type="checkbox" name="smsEnabled" className="h-5 w-5 accent-[#6b4e35]"
                defaultChecked={s['sms.enabled']} />
              Send SMS greetings (needs a Semaphore API key; per-message cost)
            </label>
          </div>

          <div className="card-pad space-y-4">
            <p className="section-title">Templates</p>
            <p className="muted">
              Placeholders such as <code>{'{{clientName}}'}</code>, <code>{'{{reference}}'}</code>,{' '}
              <code>{'{{when}}'}</code> and <code>{'{{deposit}}'}</code> are filled in
              automatically.
            </p>
            {templates.map((t) => (
              <details key={t.key} className="rounded-xl border border-sand-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-cocoa-700">
                  {t.label}
                </summary>
                <div className="mt-2 space-y-2">
                  <label className="block">
                    <span className="label">Subject</span>
                    <input name={`tpl_${t.key}_subject`} className="input" defaultValue={t.subject} />
                  </label>
                  <label className="block">
                    <span className="label">Body</span>
                    <textarea name={`tpl_${t.key}_body`} className="textarea" rows={10}
                      defaultValue={t.body} />
                  </label>
                </div>
              </details>
            ))}
          </div>
        </SettingsForm>
      </div>
    </div>
  );
}
