import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { openStay, stayForGuest, submitPreArrival } from '@/lib/manage';
import { HttpError } from '@/lib/errors';
import { getSettings } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import {
  formatStayDate,
  formatStayRange,
  labelToMinutes,
  minutesToInput,
  minutesToLabel,
  nightsBetween,
} from '@/lib/datetime';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { Card, Notice } from '@/components/ui';

export const metadata = { title: 'Your stay', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * The guest's own view of their booking: what they paid, what is left, the
 * pre-arrival form, and — once check-in has released them — the access details.
 *
 * Nothing here is behind a staff login, so every read goes through openStay(),
 * which will not take a booking reference as proof on its own.
 */

async function submitAction(formData: FormData) {
  'use server';
  const reference = String(formData.get('reference'));
  const token = String(formData.get('token') || '') || null;
  const email = String(formData.get('email') || '') || null;

  const access = await openStay({ reference, token, email });
  if (!access.ok) {
    redirect(`/manage/${reference}?error=${encodeURIComponent('That link has expired — open your confirmation email again.')}`);
  }

  const names = formData.getAll('companionName').map(String);
  const minors = formData.getAll('companionMinor').map(String);
  const arrival = String(formData.get('arrival') || '');

  try {
    await submitPreArrival({
      reservationId: access.reservationId,
      fullName: String(formData.get('fullName') ?? ''),
      mobile: String(formData.get('mobile') ?? ''),
      arrivalMinute: arrival ? labelToMinutes(arrival) : null,
      companions: names.map((name, i) => ({ name, isMinor: minors[i] === 'yes' })),
      rulesAccepted: formData.get('rules') === 'on',
      signatureName: String(formData.get('signature') ?? ''),
      notes: String(formData.get('notes') ?? ''),
    });
  } catch (err) {
    const message = err instanceof HttpError ? err.message : 'Something went wrong. Please try again.';
    redirect(`/manage/${reference}?${token ? `t=${token}&` : ''}error=${encodeURIComponent(message)}`);
  }

  redirect(
    `/manage/${reference}?${token ? `t=${token}&` : ''}ok=${encodeURIComponent('Thank you — we have everything we need for your arrival.')}`,
  );
}

export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ t?: string; email?: string; ok?: string; error?: string }>;
}) {
  const { reference } = await params;
  const sp = await searchParams;
  const settings = await getSettings();

  const access = await openStay({ reference, token: sp.t, email: sp.email });

  if (!access.ok && access.reason === 'unknown') notFound();

  if (!access.ok) {
    return (
      <div className="min-h-screen bg-[color:var(--color-sand-50)]">
        <SiteHeader settings={settings} />
        <main className="mx-auto max-w-md px-5 py-12">
          <Card title="Find your booking">
            <p className="mb-4 text-sm text-[color:var(--color-ink-500)]">
              For {reference}, please confirm the email address the booking was made with.
            </p>
            {sp.email && <Notice kind="error">That does not match the booking.</Notice>}
            <form method="get" className="space-y-3">
              <label className="block">
                <span className="label">Email address</span>
                <input className="field" name="email" type="email" required autoFocus />
              </label>
              <button className="btn btn-primary w-full" type="submit">
                Open my stay
              </button>
            </form>
            <p className="mt-4 text-xs text-[color:var(--color-ink-500)]">
              The link in your confirmation email opens this page without asking.
            </p>
          </Card>
        </main>
        <SiteFooter settings={settings} />
      </div>
    );
  }

  const stay = await stayForGuest(access.reservationId);
  const balance = stay.totalCents - stay.paidCents;
  const form = stay.checkInForm;
  const cancelled = stay.status === 'CANCELLED' || stay.status === 'NO_SHOW';
  const arrived = stay.status === 'CHECKED_IN';
  const access1 = stay.accessRecords[0];
  const carry = `${sp.t ? `t=${sp.t}` : `email=${encodeURIComponent(stay.guest.email)}`}`;

  return (
    <div className="min-h-screen bg-[color:var(--color-sand-50)]">
      <SiteHeader settings={settings} />

      <main className="mx-auto max-w-2xl px-5 py-8">
        <p className="text-sm text-[color:var(--color-ink-500)]">Booking {stay.reference}</p>
        <h1 className="display mb-1 text-3xl font-bold">{stay.property.name}</h1>
        <p className="mb-6 text-[color:var(--color-ink-500)]">
          {formatStayRange(stay.checkIn, stay.checkOut)} ·{' '}
          {nightsBetween(stay.checkIn, stay.checkOut)} night
          {nightsBetween(stay.checkIn, stay.checkOut) === 1 ? '' : 's'}
        </p>

        {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
        {sp.error && <Notice kind="error">{sp.error}</Notice>}

        {cancelled && (
          <Notice kind="error">
            This booking has been cancelled. If that is a surprise, please call us on{' '}
            {settings['business.phone']}.
          </Notice>
        )}

        <div className="space-y-4">
          <Card title="Your stay">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[color:var(--color-ink-500)]">Check in</dt>
                <dd className="font-medium">
                  {formatStayDate(stay.checkIn, { weekday: true })} from{' '}
                  {minutesToLabel(stay.property.checkInMinute)}
                </dd>
              </div>
              <div>
                <dt className="text-[color:var(--color-ink-500)]">Check out</dt>
                <dd className="font-medium">
                  {formatStayDate(stay.checkOut, { weekday: true })} by{' '}
                  {minutesToLabel(stay.property.checkOutMinute)}
                </dd>
              </div>
              <div>
                <dt className="text-[color:var(--color-ink-500)]">Guests</dt>
                <dd className="font-medium">
                  {stay.adults} adult{stay.adults === 1 ? '' : 's'}
                  {stay.children > 0 && `, ${stay.children} child${stay.children === 1 ? '' : 'ren'}`}
                </dd>
              </div>
              <div>
                <dt className="text-[color:var(--color-ink-500)]">Where</dt>
                <dd className="font-medium">
                  {[stay.property.addressLine, stay.property.barangay, stay.property.city]
                    .filter(Boolean)
                    .join(', ')}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="What you have paid">
            <ul className="space-y-1 text-sm">
              {stay.lines.map((l) => (
                <li key={l.id} className="flex justify-between">
                  <span>{l.label}</span>
                  <span className="tabular-nums">{formatPeso(l.amountCents)}</span>
                </li>
              ))}
              <li className="flex justify-between border-t border-[color:var(--color-sand-200)] pt-1 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatPeso(stay.totalCents)}</span>
              </li>
              <li className="flex justify-between">
                <span>Paid</span>
                <span className="tabular-nums">{formatPeso(stay.paidCents)}</span>
              </li>
              {balance > 0 && (
                <li className="flex justify-between font-semibold text-[color:var(--bad)]">
                  <span>
                    Still to pay
                    {stay.balanceDueAt && ` (by ${formatStayDate(stay.balanceDueAt)})`}
                  </span>
                  <span className="tabular-nums">{formatPeso(balance)}</span>
                </li>
              )}
            </ul>
            {balance > 0 && !cancelled && (
              <Link className="btn btn-primary mt-4 w-full" href={`/book/pay/${stay.reference}`}>
                Pay the balance
              </Link>
            )}
          </Card>

          {arrived && access1 && (
            <Card title="Getting in">
              {access1.code && (
                <p className="mb-2 text-sm">
                  Door code: <span className="font-mono text-lg font-bold">{access1.code}</span>
                </p>
              )}
              <p className="whitespace-pre-wrap text-sm">{access1.instructions}</p>
              {stay.property.wifiName && (
                <p className="mt-3 text-sm">
                  Wi-Fi: <strong>{stay.property.wifiName}</strong>
                  {stay.property.wifiPassword && (
                    <>
                      {' '}
                      · password <span className="font-mono">{stay.property.wifiPassword}</span>
                    </>
                  )}
                </p>
              )}
            </Card>
          )}

          {!cancelled && (
            <Card
              title={form ? 'Your arrival details' : 'Before you arrive'}
              actions={
                form && (
                  <span className="text-xs text-[color:var(--ok)]">
                    Received {formatStayDate(form.submittedAt)}
                  </span>
                )
              }
            >
              <p className="mb-4 text-sm text-[color:var(--color-ink-500)]">
                {form
                  ? 'You can change any of this until you arrive.'
                  : 'A minute now saves us both time at the door.'}
              </p>

              <form action={submitAction} className="space-y-3">
                <input type="hidden" name="reference" value={stay.reference} />
                {sp.t && <input type="hidden" name="token" value={sp.t} />}
                {!sp.t && <input type="hidden" name="email" value={stay.guest.email} />}

                <label className="block">
                  <span className="label">Who is checking in *</span>
                  <input
                    className="field"
                    name="fullName"
                    required
                    defaultValue={form?.fullName ?? `${stay.guest.firstName} ${stay.guest.lastName}`.trim()}
                  />
                </label>

                <label className="block">
                  <span className="label">Mobile number</span>
                  <input className="field" name="mobile" defaultValue={form?.mobile ?? stay.guest.mobile} />
                </label>

                <label className="block">
                  <span className="label">What time do you expect to arrive?</span>
                  <input
                    className="field"
                    name="arrival"
                    type="time"
                    defaultValue={
                      form?.arrivalMinute != null
                        ? minutesToInput(form.arrivalMinute)
                        : minutesToInput(stay.property.checkInMinute)
                    }
                  />
                  <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">
                    Check-in is from {minutesToLabel(stay.property.checkInMinute)}. Tell us if you
                    will be late and we will make sure someone is reachable.
                  </span>
                </label>

                <fieldset className="rounded-lg border border-[color:var(--color-sand-200)] p-3">
                  <legend className="label px-1">Who is coming with you</legend>
                  {[0, 1, 2, 3, 4].map((i) => {
                    const existing = form?.companions[i];
                    return (
                      <div key={i} className="mb-2 flex items-center gap-2">
                        <input
                          className="field flex-1"
                          name="companionName"
                          placeholder={i === 0 ? 'Full name' : 'Full name (optional)'}
                          defaultValue={existing?.name ?? ''}
                        />
                        <label className="flex shrink-0 items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            name="companionMinor"
                            value="yes"
                            defaultChecked={existing?.isMinor ?? false}
                          />
                          under 18
                        </label>
                      </div>
                    );
                  })}
                  <p className="text-xs text-[color:var(--color-ink-500)]">
                    You booked for {stay.adults + stay.children} guest
                    {stay.adults + stay.children === 1 ? '' : 's'} in total, including yourself.
                  </p>
                </fieldset>

                <div className="rounded-lg bg-[color:var(--color-sand-100)] p-3 text-sm">
                  <p className="mb-2 font-semibold">House rules</p>
                  <p className="whitespace-pre-wrap text-[color:var(--color-ink-500)]">
                    {stay.property.houseRules || 'No smoking indoors. Please respect quiet hours.'}
                  </p>
                </div>

                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="rules" required defaultChecked={Boolean(form?.rulesAcceptedAt)} className="mt-1" />
                  <span>I have read the house rules and accept them on behalf of my party.</span>
                </label>

                <label className="block">
                  <span className="label">Type your name to confirm *</span>
                  <input className="field" name="signature" required defaultValue={form?.signatureName ?? ''} />
                </label>

                <label className="block">
                  <span className="label">Anything we should know?</span>
                  <textarea className="field" name="notes" rows={2} defaultValue={form?.notes ?? ''} />
                </label>

                <button className="btn btn-primary w-full" type="submit">
                  {form ? 'Update my details' : 'Send my details'}
                </button>
              </form>
            </Card>
          )}

          <Card title="Need us?">
            <p className="text-sm">
              Call or message{' '}
              <a className="underline" href={`tel:${settings['business.phone'].replace(/\s/g, '')}`}>
                {settings['business.phone']}
              </a>
              {stay.property.emergencyContact && (
                <>
                  {' '}
                  — or, if it is urgent and out of hours, {stay.property.emergencyContact}.
                </>
              )}
            </p>
            <p className="mt-2 text-xs text-[color:var(--color-ink-500)]">
              <Link className="underline" href={`/manage/${stay.reference}?${carry}`}>
                Bookmark this page
              </Link>{' '}
              to come back to it.
            </p>
          </Card>
        </div>
      </main>

      <SiteFooter settings={settings} />
    </div>
  );
}
