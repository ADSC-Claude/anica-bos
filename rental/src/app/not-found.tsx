import Link from 'next/link';

/**
 * A branded 404.
 *
 * This one is prerendered as static at build time, which is exactly why it
 * must not read from the database — it would take the build down with it. It
 * reads nothing, so it cannot.
 *
 * The links are the ones a lost guest actually wants: the stays, and the way
 * back into a booking they have already made.
 */
export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">404</p>

      <h1 className="display text-balance text-[2rem] leading-tight sm:text-[2.5rem]">
        There&rsquo;s nothing at this address.
      </h1>

      <p className="mt-5 text-[color:var(--color-ink-700)]">
        The page may have moved, or the link may have been mistyped. Nothing is broken.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/stays" className="btn-brand tracked">
          See our stays
        </Link>
        <Link
          href="/"
          className="tracked inline-flex items-center justify-center border border-[color:var(--color-sand-300)] px-7 py-[0.95rem] hover:bg-[color:var(--color-sand-100)]"
        >
          Back to the start
        </Link>
      </div>

      <div className="mt-10 border-t border-[color:var(--color-sand-200)] pt-8 text-sm">
        <p className="text-[color:var(--color-ink-500)]">
          Looking for a booking you have already made?{' '}
          <Link href="/manage" className="font-medium text-[color:var(--color-clay-600)] underline">
            Find it here
          </Link>
          , or{' '}
          <Link href="/contact" className="font-medium text-[color:var(--color-clay-600)] underline">
            ask us
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
