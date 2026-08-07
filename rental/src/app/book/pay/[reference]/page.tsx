import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { startCheckout } from '@/lib/payments';
import { HttpError } from '@/lib/guard';
import { formatPeso } from '@/lib/money';
import { formatStayDate } from '@/lib/datetime';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';

export const metadata = { title: 'Pay your balance', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Where the balance-due email lands. Opens a fresh gateway session for exactly
 * what is outstanding — never for a stale amount computed when the email was
 * written.
 */
async function payNow(formData: FormData) {
  'use server';
  const reference = String(formData.get('reference'));
  const r = await prisma.reservation.findUnique({ where: { reference }, select: { id: true } });
  if (!r) notFound();

  try {
    const checkout = await startCheckout(r.id);
    redirect(checkout.checkoutUrl);
  } catch (err) {
    if (err instanceof HttpError) {
      redirect(`/book/pay/${reference}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ error?: string; cancelled?: string }>;
}) {
  const { reference } = await params;
  const flash = await searchParams;
  const settings = await getSettings();

  const r = await prisma.reservation.findUnique({
    where: { reference },
    include: { property: { select: { name: true } }, guest: { select: { firstName: true } } },
  });
  if (!r) notFound();

  const balance = r.totalCents - r.paidCents;

  return (
    <>
      <SiteHeader settings={settings} />
      <main className="mx-auto max-w-md px-5 py-10">
        <h1 className="display text-2xl font-bold">Your booking {r.reference}</h1>
        <p className="text-sm text-[color:var(--color-ink-500)]">
          {r.property.name} · {formatStayDate(r.checkIn)} → {formatStayDate(r.checkOut)}
        </p>

        {flash.cancelled && (
          <p className="mt-4 rounded-lg bg-[#fdf0dd] p-3 text-sm">
            Payment cancelled. Your dates are still held for now — you can try again below.
          </p>
        )}
        {flash.error && (
          <p role="alert" className="mt-4 rounded-lg bg-[#fbe9e7] p-3 text-sm text-[color:var(--bad)]">
            {flash.error}
          </p>
        )}

        <div className="card mt-6 p-5">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatPeso(r.totalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Paid</dt>
              <dd className="tabular-nums">{formatPeso(r.paidCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-[color:var(--color-sand-200)] pt-1 text-base font-bold">
              <dt>Balance</dt>
              <dd className="tabular-nums">{formatPeso(balance)}</dd>
            </div>
          </dl>

          {balance > 0 ? (
            <form action={payNow} className="mt-5">
              <input type="hidden" name="reference" value={r.reference} />
              <button className="btn btn-primary w-full" type="submit">
                Pay {formatPeso(balance)}
              </button>
              <p className="mt-2 text-center text-xs text-[color:var(--color-ink-500)]">
                GCash, Maya, card or online banking. Secured by PayMongo — we never see your card.
              </p>
            </form>
          ) : (
            <p className="mt-5 rounded-lg bg-[#e6f2ea] p-3 text-center text-sm text-[color:var(--ok)]">
              This booking is paid in full. Nothing to do — see you on{' '}
              {formatStayDate(r.checkIn)}.
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href={`/manage/${r.reference}`} className="underline">
            View the whole booking
          </Link>
        </p>
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
