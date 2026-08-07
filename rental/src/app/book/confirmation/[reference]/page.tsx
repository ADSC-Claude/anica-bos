import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import { formatStayDate, minutesToLabel } from '@/lib/datetime';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';

export const metadata = { title: 'Booking confirmed', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * What a guest sees after paying — and what they will screenshot, so it
 * carries everything the email does. It never *sets* a status; if the webhook
 * has not landed yet it says so plainly rather than guessing.
 */
export default async function ConfirmationPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const settings = await getSettings();

  const r = await prisma.reservation.findUnique({
    where: { reference },
    include: {
      property: true,
      guest: { select: { firstName: true, email: true } },
      lines: { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!r) notFound();

  const balance = r.totalCents - r.paidCents;
  const confirmed = r.status === 'CONFIRMED' || r.status === 'CHECKED_IN';

  return (
    <>
      <SiteHeader settings={settings} />
      <main className="mx-auto max-w-2xl px-5 py-10">
        {confirmed ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-wide text-[color:var(--ok)]">
              You are booked
            </p>
            <h1 className="display mt-1 text-3xl font-bold">Thank you, {r.guest.firstName}.</h1>
          </>
        ) : r.status === 'PENDING' ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-wide text-[color:var(--warn)]">
              Confirming your payment
            </p>
            <h1 className="display mt-1 text-3xl font-bold">Nearly there.</h1>
            <p className="mt-2 text-sm">
              Your dates are held. We are waiting for the payment to confirm — this usually takes a
              few seconds. Refresh this page in a moment, and either way you will get an email.
            </p>
          </>
        ) : (
          <>
            <h1 className="display text-3xl font-bold">This booking is {r.status.toLowerCase()}.</h1>
            <p className="mt-2 text-sm">
              If that is not what you expected, please contact us at {settings['business.phone']}.
            </p>
          </>
        )}

        <p className="mt-6 rounded-xl bg-white p-5 text-center">
          <span className="text-xs uppercase tracking-wide text-[color:var(--color-ink-500)]">
            Your reference
          </span>
          <span className="display block text-3xl font-bold tracking-wider">{r.reference}</span>
        </p>

        <section className="card mt-6 p-5">
          <h2 className="mb-3 font-semibold">{r.property.name}</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-[color:var(--color-ink-500)]">Check in</dt>
            <dd>
              {formatStayDate(r.checkIn, { weekday: true })}, from {minutesToLabel(r.property.checkInMinute)}
            </dd>
            <dt className="text-[color:var(--color-ink-500)]">Check out</dt>
            <dd>
              {formatStayDate(r.checkOut, { weekday: true })}, by {minutesToLabel(r.property.checkOutMinute)}
            </dd>
            <dt className="text-[color:var(--color-ink-500)]">Guests</dt>
            <dd>{r.adults + r.children}</dd>
            <dt className="text-[color:var(--color-ink-500)]">Where</dt>
            <dd>{[r.property.addressLine, r.property.barangay, r.property.city].filter(Boolean).join(', ')}</dd>
          </dl>
        </section>

        <section className="card mt-4 p-5">
          <h2 className="mb-3 font-semibold">What it costs</h2>
          <table className="w-full text-sm">
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-1">{l.label}</td>
                  <td className="py-1 text-right tabular-nums">{formatPeso(l.amountCents)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[color:var(--color-sand-300)] font-bold">
                <td className="py-1.5">Total</td>
                <td className="py-1.5 text-right tabular-nums">{formatPeso(r.totalCents)}</td>
              </tr>
              <tr>
                <td className="py-1">Paid</td>
                <td className="py-1 text-right tabular-nums">{formatPeso(r.paidCents)}</td>
              </tr>
              {balance > 0 && (
                <tr className="font-semibold">
                  <td className="py-1">
                    Balance{r.balanceDueAt ? `, due ${formatStayDate(r.balanceDueAt)}` : ''}
                  </td>
                  <td className="py-1 text-right tabular-nums">{formatPeso(balance)}</td>
                </tr>
              )}
            </tbody>
          </table>
          {balance > 0 && (
            <Link className="btn btn-primary mt-4 w-full" href={`/book/pay/${r.reference}`}>
              Pay the balance now
            </Link>
          )}
        </section>

        <section className="card mt-4 p-5 text-sm">
          <h2 className="mb-2 font-semibold">What happens next</h2>
          <ol className="list-decimal space-y-1 pl-5 text-[color:var(--color-ink-500)]">
            <li>A confirmation email is on its way to {r.guest.email}.</li>
            {balance > 0 && <li>We will remind you about the balance before you arrive.</li>}
            <li>Three days before check-in: directions, house rules and what to bring.</li>
            <li>On the morning of check-in: your access code and the Wi-Fi.</li>
          </ol>
          <p className="mt-3">
            You can view this booking any time at{' '}
            <Link href={`/manage/${r.reference}`} className="underline">
              /manage/{r.reference}
            </Link>{' '}
            using the email or mobile you booked with.
          </p>
        </section>

        <p className="mt-6 text-center text-sm text-[color:var(--color-ink-500)]">
          Questions? {settings['business.email']} · {settings['business.phone']}
        </p>
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
