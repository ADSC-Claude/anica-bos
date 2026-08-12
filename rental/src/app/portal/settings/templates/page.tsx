import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { minutesToInput, labelToMinutes, minutesToLabel } from '@/lib/datetime';
import { audit, diff } from '@/lib/audit';
import { BackLink, Card, Notice, PageHeader, Pill } from '@/components/ui';

export const metadata = { title: 'Message templates' };
export const dynamic = 'force-dynamic';

const TIMING_LABELS: Record<string, string> = {
  ON_BOOKING_CONFIRMED: 'the moment a booking is confirmed',
  DAYS_BEFORE_CHECKIN: 'days before check-in',
  ON_CHECKIN_DAY: 'on the morning of arrival',
  EVENING_OF_CHECKIN: 'the evening they arrive',
  EVENING_BEFORE_CHECKOUT: 'the evening before checkout',
  ON_CHECKOUT_DAY: 'on the morning of checkout',
  DAYS_AFTER_CHECKOUT: 'days after checkout',
  MANUAL: 'only when someone sends it',
};

/** The placeholders a template may use. Anything else renders as itself. */
const PLACEHOLDERS = [
  'guestFirstName', 'guestName', 'reference', 'propertyName', 'checkIn', 'checkOut',
  'nights', 'guests', 'checkInTime', 'checkOutTime', 'total', 'paid', 'balance',
  'balanceNote', 'breakdown', 'houseRules', 'transportNotes', 'parkingNotes',
  'emergencyContact', 'payLink', 'checkInLink', 'reviewLink', 'accessInstructions',
  'wifiName', 'wifiPassword', 'businessName', 'businessPhone', 'businessEmail',
];

function back(message: string, kind: 'ok' | 'error' = 'ok'): never {
  redirect(`/portal/settings/templates?${kind}=${encodeURIComponent(message)}`);
}

async function saveAction(formData: FormData) {
  'use server';
  const user = await requirePage('settings.edit');
  const id = String(formData.get('id'));

  const before = await prisma.messageTemplate.findUnique({
    where: { id },
    select: { name: true, subject: true, body: true, offsetDays: true, sendAtMinute: true, active: true },
  });
  if (!before) back('That template no longer exists.', 'error');

  const sendAt = String(formData.get('sendAt') || '');
  const after = {
    name: String(formData.get('name') ?? '').trim() || before.name,
    subject: String(formData.get('subject') ?? ''),
    body: String(formData.get('body') ?? ''),
    offsetDays: Number(formData.get('offsetDays') ?? before.offsetDays),
    sendAtMinute: sendAt ? labelToMinutes(sendAt) : before.sendAtMinute,
    active: formData.get('active') === 'on',
  };

  await prisma.messageTemplate.update({ where: { id }, data: after });

  const changes = diff(before as Record<string, unknown>, after as Record<string, unknown>);
  await audit(user, {
    module: 'settings',
    action: 'template.update',
    entityType: 'MessageTemplate',
    entityId: id,
    summary: `Template "${after.name}" updated`,
    before: changes.before,
    after: changes.after,
  });
  back(`"${after.name}" saved. Messages already sent keep the wording they went out with.`);
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePage('settings.view');
  const sp = await searchParams;
  const mayEdit = can(user.role, 'settings.edit');

  const templates = await prisma.messageTemplate.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { messages: true } } },
  });

  return (
    <>
      <BackLink href="/portal/settings">Settings</BackLink>
      <PageHeader
        title="Message templates"
        subtitle="What a guest receives, and when. Editing one changes what goes out next — never what already went."
      />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      <Card title="Placeholders" className="mb-4">
        <p className="mb-2 text-sm text-[color:var(--color-ink-500)]">
          Anything in double braces is replaced when the message is rendered. An unknown
          placeholder is left as written rather than blanked, so a typo is visible instead of
          silently deleting a sentence.
        </p>
        <p className="flex flex-wrap gap-1">
          {PLACEHOLDERS.map((p) => (
            <code
              key={p}
              className="rounded bg-[color:var(--color-sand-100)] px-1.5 py-0.5 text-xs"
            >{`{{${p}}}`}</code>
          ))}
        </p>
        <p className="mt-2 text-xs text-[color:var(--color-ink-500)]">
          Wi-Fi and access details resolve to a holding line in every template except the
          arrival-morning one. A door code sitting in an inbox for three days is a door standing
          open for three days.
        </p>
      </Card>

      <div className="space-y-4">
        {templates.map((t) => (
          <Card
            key={t.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {t.name}
                {t.active ? <Pill tone="ok">on</Pill> : <Pill tone="muted">off</Pill>}
                <span className="text-xs font-normal text-[color:var(--color-ink-500)]">
                  {t._count.messages} sent or queued
                </span>
              </span>
            }
          >
            <p className="mb-3 text-sm text-[color:var(--color-ink-500)]">
              Sends {TIMING_LABELS[t.timing] ?? t.timing.toLowerCase()}
              {(t.timing === 'DAYS_BEFORE_CHECKIN' || t.timing === 'DAYS_AFTER_CHECKOUT') &&
                ` (${t.offsetDays})`}
              {t.timing !== 'ON_BOOKING_CONFIRMED' && t.timing !== 'MANUAL' &&
                ` at ${minutesToLabel(t.sendAtMinute)}`}
              .
            </p>

            <form action={saveAction} className="grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={t.id} />
              <label className="block sm:col-span-2">
                <span className="label">Name</span>
                <input className="field" name="name" defaultValue={t.name} readOnly={!mayEdit} />
              </label>
              {(t.timing === 'DAYS_BEFORE_CHECKIN' || t.timing === 'DAYS_AFTER_CHECKOUT') && (
                <label className="block">
                  <span className="label">Days</span>
                  <input
                    className="field"
                    name="offsetDays"
                    type="number"
                    min="0"
                    defaultValue={t.offsetDays}
                    readOnly={!mayEdit}
                  />
                </label>
              )}
              {t.timing !== 'ON_BOOKING_CONFIRMED' && t.timing !== 'MANUAL' && (
                <label className="block">
                  <span className="label">Send at</span>
                  <input
                    className="field"
                    name="sendAt"
                    type="time"
                    defaultValue={minutesToInput(t.sendAtMinute)}
                    readOnly={!mayEdit}
                  />
                </label>
              )}
              <label className="block sm:col-span-4">
                <span className="label">Subject</span>
                <input className="field" name="subject" defaultValue={t.subject} readOnly={!mayEdit} />
              </label>
              <label className="block sm:col-span-4">
                <span className="label">Body</span>
                <textarea
                  className="field font-mono text-xs"
                  name="body"
                  rows={10}
                  defaultValue={t.body}
                  readOnly={!mayEdit}
                />
              </label>
              {mayEdit && (
                <>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" name="active" defaultChecked={t.active} />
                    <span>Send this one</span>
                  </label>
                  <div className="sm:col-span-2">
                    <button className="btn btn-primary" type="submit">
                      Save
                    </button>
                  </div>
                </>
              )}
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}
