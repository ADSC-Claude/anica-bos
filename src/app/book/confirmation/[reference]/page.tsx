import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import { formatManila } from '@/lib/datetime';
import { cancellationPolicyText } from '@/lib/booking-policy';
import { transferAccounts } from '@/lib/transfer-accounts';
import { ProofUpload } from './proof-upload';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your booking' };

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const settings = await getSettings();

  const appt = await prisma.appointment.findUnique({
    where: { reference },
    include: {
      client: true,
      resource: true,
      branch: true,
      services: { include: { service: true, employee: true } },
    },
  });
  if (!appt) notFound();

  const paid = appt.depositStatus === 'PAID';
  const awaitingVerification = appt.depositStatus === 'AWAITING_VERIFICATION';
  const failed = appt.depositStatus === 'FAILED' || appt.status === 'EXPIRED';

  const tone = paid
    ? { bg: 'bg-cocoa-600', label: 'Reservation confirmed', icon: '✓' }
    : failed
      ? { bg: 'bg-clay-500', label: 'Not confirmed', icon: '!' }
      : { bg: 'bg-sand-400', label: 'Awaiting your reservation fee', icon: '⏳' };

  return (
    <div className="min-h-dvh bg-sand-50">
      <main className="mx-auto max-w-lg px-4 py-10">
        <div className={`rounded-3xl ${tone.bg} px-6 py-8 text-center text-white`}>
          <p className="text-3xl">{tone.icon}</p>
          <h1 className="mt-2 font-display text-xl font-semibold">{tone.label}</h1>
          <p className="mt-1 text-sm opacity-90">Booking reference</p>
          <p className="text-2xl font-bold tracking-widest">{appt.reference}</p>
        </div>

        <div className="card-pad mt-4 space-y-2 text-sm">
          <Row label="Name" value={appt.client.name} />
          <Row
            label="Service"
            value={appt.services.map((s) => s.service.name).join(', ')}
          />
          <Row label="When" value={formatManila(appt.startAt, { time: true, weekday: true })} />
          <Row label="Therapist" value={appt.services[0]?.employee?.name ?? 'To be assigned'} />
          <Row label="Room / bed" value={appt.resource?.name ?? 'To be assigned'} />
          <Row label="Branch" value={appt.branch.name} />
          <hr className="border-sand-200" />
          <Row
            label={`Reservation fee (${settings['booking.depositPercent']}%)`}
            value={formatPeso(appt.depositAmountCents)}
          />
          <Row
            label="Status"
            value={
              paid
                ? `Paid ${formatPeso(appt.depositPaidCents)}`
                : awaitingVerification
                  ? 'Waiting for us to verify your payment'
                  : failed
                    ? 'Not received'
                    : 'Not yet paid'
            }
            strong
          />
        </div>

        {paid && (
          <div className="card-pad mt-4 border-cocoa-200 bg-cocoa-50 text-sm text-cocoa-700">
            <p className="font-semibold">Your slot is secured. See you soon!</p>
            <p className="mt-1">
              The {formatPeso(appt.depositPaidCents)} you paid is deducted from your final
              bill. Please arrive 10 minutes early. A confirmation email is on its way to{' '}
              {appt.client.email}.
            </p>
          </div>
        )}

        {/* Repeated here, not only on the booking form: this is the page a guest
            comes back to when her plans change, and it is the moment she needs
            to know how much notice to give. */}
        {!failed && (
          <div className="card-pad mt-4 text-xs leading-relaxed text-cocoa-500">
            <p className="font-semibold uppercase tracking-wide text-cocoa-500">
              Cancellations &amp; no-shows
            </p>
            <p className="mt-1">
              {cancellationPolicyText({
                windowHours: settings['booking.cancellationHours'],
                inTimePolicy: settings['booking.depositOnCancel'],
              })}
            </p>
            <p className="mt-1">
              To cancel or move your booking, contact us on{' '}
              {settings['business.contact']} and quote {appt.reference}.
            </p>
          </div>
        )}

        {awaitingVerification && (
          <div className="mt-4 space-y-4">
            <div className="card-pad border-sand-300 bg-sand-100 text-sm text-cocoa-700">
              <p className="font-semibold">One last step — send your reservation fee</p>
              <p className="mt-1">
                Send <strong>{formatPeso(appt.depositAmountCents)}</strong> to:
              </p>
              <ul className="mt-2 space-y-1">
                <li>
                  GCash: <strong>{settings['booking.gcashNumber']}</strong> (
                  {settings['booking.gcashName']})
                </li>
                {/* One line per bank, so a guest who does not use BDO can see
                    at a glance whether there is one she does use. */}
                {transferAccounts(settings['booking.bankDetails']).map((account) => (
                  <li key={account}>Bank: {account}</li>
                ))}
              </ul>
              <p className="mt-2">
                Then upload a screenshot below. We verify it at the front desk within
                minutes, and this page will show &ldquo;confirmed&rdquo;.
              </p>
            </div>
            {appt.depositProofUrl ? (
              <div className="card-pad text-sm text-cocoa-700">
                <p className="font-semibold">Proof received — thank you!</p>
                <p className="mt-1">
                  Reference {appt.depositReference}. Our receptionist is checking it now.
                  Refresh this page in a moment.
                </p>
              </div>
            ) : (
              <ProofUpload reference={appt.reference} />
            )}
          </div>
        )}

        {!paid && !awaitingVerification && !failed && (
          <div className="card-pad mt-4 text-sm text-cocoa-700">
            <p className="font-semibold">Payment not completed</p>
            <p className="mt-1">
              Your slot is held until{' '}
              {appt.expiresAt ? formatManila(appt.expiresAt, { time: true }) : 'shortly'}. You
              can start a fresh booking any time.
            </p>
            <Link href="/book" className="btn-primary mt-3 w-full">
              Book again
            </Link>
          </div>
        )}

        {failed && (
          <div className="card-pad mt-4 text-sm text-cocoa-700">
            <p className="font-semibold">This booking was not confirmed</p>
            <p className="mt-1">
              Nothing has been charged. You&apos;re very welcome to book another slot, or
              call us at {settings['business.contact']} and we&apos;ll fit you in.
            </p>
            <Link href="/book" className="btn-primary mt-3 w-full">
              Book again
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-cocoa-600 underline underline-offset-4">
            ← Back to the ANICA website
          </Link>
        </p>
      </main>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-cocoa-500">{label}</span>
      <span className={`text-right ${strong ? 'font-semibold text-cocoa-800' : 'text-cocoa-700'}`}>
        {value}
      </span>
    </div>
  );
}
