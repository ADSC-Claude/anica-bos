import Link from 'next/link';
import { BookingWizard } from './wizard';
import { getSettings } from '@/lib/settings';

export const metadata = {
  title: 'Book an appointment',
  description:
    'Reserve your massage, body scrub, foot spa or sauna session at ANICA Wellness Spa, Quezon City.',
};
export const dynamic = 'force-dynamic';

export default async function BookPage() {
  const settings = await getSettings();
  return (
    <div className="min-h-dvh bg-sand-50">
      <header className="border-b border-sand-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-moss-600 text-lg text-white">
              ✿
            </span>
            <span className="font-display text-sm font-semibold text-moss-800">
              ANICA Wellness Spa
            </span>
          </Link>
          <Link href="/" className="text-sm text-moss-600 underline underline-offset-4">
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
        <h1 className="font-display text-2xl font-semibold text-moss-800">
          Book your appointment
        </h1>
        <p className="muted mt-1">
          Open {settings['business.openMinute'] === 720 ? '12nn' : ''}–12mn daily. A{' '}
          {settings['booking.depositPercent']}% reservation fee secures your slot and is
          deducted from your final bill.
        </p>
        <BookingWizard />
      </main>
    </div>
  );
}
