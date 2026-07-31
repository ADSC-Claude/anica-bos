import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSimulated } from '@/lib/paymongo';
import { SimulatePanel } from './panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Simulated payment' };

/**
 * Stand-in for the hosted PayMongo checkout page, used only when no gateway
 * keys are configured. It exists so the full booking → deposit → confirmation
 * flow can be demonstrated and tested without credentials.
 */
export default async function SimulatePaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  if (!isSimulated()) redirect('/book');
  const { ref } = await searchParams;
  if (!ref) redirect('/book');

  return (
    <div className="flex min-h-dvh items-center justify-center bg-sand-100 px-4">
      <div className="w-full max-w-sm">
        <div className="card-pad">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-clay-500">
            Simulated gateway — development only
          </p>
          <h1 className="font-display text-lg font-semibold text-cocoa-800">
            Pay your reservation fee
          </h1>
          <p className="muted mt-1">
            No PayMongo keys are configured, so this page stands in for the real GCash /
            Maya / card checkout. Add <code>PAYMONGO_SECRET_KEY</code> to switch to the live
            gateway.
          </p>
          <SimulatePanel reference={ref} />
        </div>
        <p className="mt-4 text-center text-sm">
          <Link href="/book" className="text-cocoa-600 underline underline-offset-4">
            Cancel and go back
          </Link>
        </p>
      </div>
    </div>
  );
}
