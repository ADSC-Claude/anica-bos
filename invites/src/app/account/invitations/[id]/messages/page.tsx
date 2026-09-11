import { notFound } from 'next/navigation';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { getSettings } from '@/lib/settings';
import { resolveMessages, prefsOf, TONES, DEFAULT_TONE, smsSender, smsSenderTooLong, emailSender } from '@/lib/messages';
import { creditsFor } from '@/lib/sms';
import { occasionLabel } from '@/lib/occasions';
import { invitationUrl } from '@/lib/app-url';
import { formatDate } from '@/lib/datetime';
import { displayTitle } from '@/lib/sections';
import { contentOf } from '@/lib/invitations';
import { PageHeader, BackLink, Card, Notice, Pill } from '@/components/ui';
import { setMessageToneAction, saveMessageAction, resetMessageAction, setPickedMessagesAction } from '@/app/account/actions';
import { campaignFor, pickedKinds, CAMPAIGN_KINDS, dueDateKey } from '@/lib/campaigns';
import { formatDate as fmtDate } from '@/lib/datetime';
import { SmsPreview, EmailPreview, VariableHints, sampleVars, fill } from './preview';

export const dynamic = 'force-dynamic';

/**
 * The five messages this couple's guests will get, as their guests will get
 * them.
 *
 * Everything here is rendered on the server and edited through a form, because
 * the only interactive part is typing into a box and pressing save — and a
 * preview that updates as you type would be a client bundle carrying the GSM
 * segment tables to do arithmetic the server already does.
 */
export default async function MessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  const settings = await getSettings();

  const content = contentOf(inv.content);
  const hosts = inv.title.trim() || displayTitle(inv.occasion, content);
  const eventDate = inv.eventAt ? formatDate(inv.eventAt) : 'the day';
  // A real personal link, so the length in the preview is the length that will
  // be charged for. A guest's token is the same size for everyone.
  const link = invitationUrl(inv.slug, 'sampleGuestToken1234');

  const prefs = prefsOf(inv.guestMessages);
  const tone = prefs.tone ?? DEFAULT_TONE;
  const messages = resolveMessages(inv.occasion, inv.guestMessages);
  const vars = sampleVars(hosts, eventDate, link);

  // What they bought, which of the four it covers, and which are going out.
  const campaign = campaignFor(inv.addOns);
  const scheduled = campaign ? pickedKinds(campaign, prefs.picked) : [];
  const sending = settings['campaigns.enabled'];

  const registered = settings['sms.senderName']?.trim() ?? '';
  const sender = smsSender(registered);
  const from = emailSender(settings['business.name'] ?? 'You Are Invited', inv.occasion);

  return (
    <>
      <BackLink href={`/account/invitations/${inv.id}`}>{inv.title}</BackLink>
      <PageHeader
        title="Messages to your guests"
        eyebrow={occasionLabel(inv.occasion)}
        subtitle="The five messages your guests get, written for your occasion. Read them as your guests will, change any word you like, and nothing goes out until you say so."
      />

      {!registered && (
        <div className="mb-4">
          <Notice tone="warn">
            These previews show the sender name <strong>{sender}</strong>. The real one has to be registered with our
            texting provider first, and networks usually cap it at 11 characters — {sender} is {sender.length}
            {smsSenderTooLong(sender) ? ', so it will most likely need shortening before it can be registered' : ''}.
            Nothing about your words changes either way.
          </Notice>
        </div>
      )}

      {campaign && (
        <div className="mb-4">
          <Card title="What goes out, and when">
            <p className="mb-3 text-xs text-[color:var(--color-ink-500)]">
              Your plan covers <strong>{campaign.allowance} of the 4</strong> scheduled messages
              {campaign.email ? ', by text and e-mail' : ', by text'}, for up to{' '}
              <strong>{campaign.guests.toLocaleString('en-PH')} guests</strong>.
              {!sending && ' Scheduled sending is not switched on yet, so nothing will go out until we turn it on.'}
            </p>
            <form action={setPickedMessagesAction.bind(null, inv.id)} className="grid gap-2">
              {CAMPAIGN_KINDS.map((kind) => {
                const m = messages.find((x) => x.kind === kind)!;
                const on = scheduled.includes(kind);
                const day = inv.eventAt ? dueDateKey(kind, inv.eventAt) : null;
                return (
                  <label key={kind} className="flex items-start gap-3 rounded-lg border border-[color:var(--color-ink-200,#e7e5e4)] px-3 py-2">
                    <input type="checkbox" name="picked" value={kind} defaultChecked={on} className="mt-1 h-4 w-4" />
                    <span className="text-sm">
                      <span className="font-medium">{m.label}</span>
                      <span className="block text-xs text-[color:var(--color-ink-500)]">
                        {m.when}
                        {day && inv.eventAt ? ` · ${fmtDate(new Date(`${day}T00:00:00+08:00`))}` : ''}
                      </span>
                    </span>
                  </label>
                );
              })}
              <div className="flex items-center gap-3">
                <button className="btn btn-primary btn-sm" type="submit">Save what goes out</button>
                <span className="text-xs text-[color:var(--color-ink-500)]">
                  Tick more than {campaign.allowance} and the earliest {campaign.allowance} are sent.
                </span>
              </div>
            </form>
          </Card>
        </div>
      )}

      <Card title="How they are written">
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <form key={t.key} action={setMessageToneAction.bind(null, inv.id, t.key)}>
              <button
                type="submit"
                aria-pressed={tone === t.key}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  tone === t.key
                    ? 'border-[color:var(--color-plum-600)] bg-[color:var(--color-plum-50,#faf5ff)]'
                    : 'border-[color:var(--color-ink-200,#e7e5e4)] hover:border-[color:var(--color-ink-400,#a8a29e)]'
                }`}
              >
                <span className="block text-sm font-semibold">
                  {t.label} {tone === t.key && <span className="text-[color:var(--color-plum-600)]">✓</span>}
                </span>
                <span className="block max-w-xs text-xs text-[color:var(--color-ink-500)]">{t.blurb}</span>
              </button>
            </form>
          ))}
        </div>
        <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">
          Changing this rewrites every message you have not edited yourself. Anything you have changed stays as you
          wrote it.
        </p>
      </Card>

      <div className="mt-4 grid gap-4">
        {messages.map((m) => {
          const smsText = fill(m.text.sms, vars);
          const segments = creditsFor(smsText);
          const edited = m.edited.sms || m.edited.emailSubject || m.edited.emailBody;
          return (
            <Card
              key={m.kind}
              title={m.label}
              actions={
                <span className="flex items-center gap-2">
                  <Pill tone="muted">{m.when}</Pill>
                  {campaign && CAMPAIGN_KINDS.includes(m.kind) && (
                    <Pill tone={scheduled.includes(m.kind) ? 'ok' : 'muted'}>
                      {scheduled.includes(m.kind) ? 'Going out' : 'Not sending'}
                    </Pill>
                  )}
                  {edited && <Pill tone="ok">Your words</Pill>}
                </span>
              }
            >
              <p className="mb-4 max-w-2xl text-xs text-[color:var(--color-ink-500)]">{m.blurb}</p>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-[color:var(--color-ink-500)] uppercase">
                    As a text
                  </p>
                  <SmsPreview sender={sender} body={smsText} segments={segments} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-[color:var(--color-ink-500)] uppercase">
                    As an e-mail
                  </p>
                  <EmailPreview
                    from={from}
                    subject={fill(m.text.emailSubject, vars)}
                    body={fill(m.text.emailBody, vars)}
                  />
                </div>
              </div>

              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-[color:var(--color-plum-600)]">
                  Change these words
                </summary>
                <form action={saveMessageAction.bind(null, inv.id, m.kind)} className="mt-3 grid gap-3">
                  <label className="grid gap-1">
                    <span className="text-xs font-medium">Text message</span>
                    <textarea name="sms" defaultValue={m.text.sms} rows={3} className="field font-mono text-xs" />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium">E-mail subject</span>
                    <input name="emailSubject" defaultValue={m.text.emailSubject} className="field font-mono text-xs" />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium">E-mail message</span>
                    <textarea name="emailBody" defaultValue={m.text.emailBody} rows={9} className="field font-mono text-xs" />
                  </label>
                  <VariableHints />
                  <div className="flex gap-2">
                    <button className="btn btn-primary btn-sm" type="submit">Save</button>
                  </div>
                </form>
                {edited && (
                  <form action={resetMessageAction.bind(null, inv.id, m.kind)} className="mt-2">
                    <button className="btn btn-secondary btn-sm" type="submit">
                      Put back our wording
                    </button>
                  </form>
                )}
              </details>
            </Card>
          );
        })}
      </div>
    </>
  );
}
