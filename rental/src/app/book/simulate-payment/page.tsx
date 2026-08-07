import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { isSimulated } from '@/lib/paymongo';
import { formatPeso } from '@/lib/money';
import { SimulateForm } from './form';

export const metadata = { title: 'Simulated payment', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Stands in for the PayMongo hosted page when no gateway key is set, so the
 * whole book → pay → confirm → clean → review chain is demonstrable out of the
 * box. It refuses to render in production.
 */
export default async function SimulatePaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  if (!isSimulated() || process.env.NODE_ENV === 'production') notFound();

  const { ref } = await searchParams;
  if (!ref) notFound();

  const payment = await prisma.payment.findUnique({
    where: { reference: ref },
    include: { reservation: { include: { property: { select: { name: true } } } } },
  });
  if (!payment) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <div className="card p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--warn)]">
          Simulated gateway — development only
        </p>
        <h1 className="display text-2xl font-bold">{payment.reservation.property.name}</h1>
        <p className="text-sm text-[color:var(--color-ink-500)]">
          Booking {payment.reservation.reference}
        </p>

        <p className="my-6 text-center">
          <span className="block text-xs uppercase text-[color:var(--color-ink-500)]">Amount</span>
          <span className="text-3xl font-bold">{formatPeso(payment.amountCents)}</span>
        </p>

        <SimulateForm reference={payment.reference} bookingReference={payment.reservation.reference} />

        <p className="mt-4 text-xs text-[color:var(--color-ink-500)]">
          With a real <code>PAYMONGO_SECRET_KEY</code> set, this screen is PayMongo&apos;s hosted
          checkout instead. Either way the payment is confirmed by the same webhook handler — only
          the gateway is stubbed.
        </p>
      </div>
    </main>
  );
}
