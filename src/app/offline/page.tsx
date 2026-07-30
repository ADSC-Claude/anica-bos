import Link from 'next/link';

export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-sand-50 px-4">
      <div className="card-pad max-w-sm text-center">
        <p className="text-4xl">📶</p>
        <h1 className="mt-2 font-display text-xl font-semibold text-moss-800">You are offline</h1>
        <p className="muted mt-2">
          ANICA can still show you the last saved copy of today&apos;s schedule. Saving, checkout
          and anything that changes records will not work until the connection returns — nothing
          is queued, so nothing can be lost or charged twice.
        </p>
        <div className="mt-4 grid gap-2">
          <Link href="/portal/appointments" className="btn-primary">
            View today&apos;s schedule
          </Link>
          <Link href="/portal" className="btn-secondary">
            Try the dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
