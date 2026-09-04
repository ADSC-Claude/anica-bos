'use client';

import { useEffect } from 'react';

/**
 * What a guest sees when a page cannot be rendered.
 *
 * Without this file, Next.js shows an unstyled browser page reading
 * "Application error: a server-side exception has occurred" followed by a
 * digest number. To a guest deciding whether to book, that reads as a business
 * that has gone out of business.
 *
 * The commonest cause by far is the database being briefly unreachable, and
 * every public page reads from it. So this page assumes nothing: no data, no
 * settings, no fonts beyond the ones already loaded. It says what happened in
 * plain words, offers to try again, and — the part that matters — gives a way
 * to reach a person, because someone whose stay starts tomorrow needs an
 * answer, not an apology.
 *
 * The contact details come from build-time environment variables rather than
 * the database, because the database is the thing most likely to be down. If
 * they are not set the block is omitted rather than shown blank or, worse,
 * showing the placeholder defaults as though they were real.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only thread back to the server log for this exact
    // failure, so it goes to the browser console even though it is hidden
    // from the page.
    console.error('[page error]', error.digest ?? '(no digest)', error);
  }, [error]);

  const phone = process.env.NEXT_PUBLIC_CONTACT_PHONE;
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">Something went wrong</p>

      <h1 className="display text-balance text-[2rem] leading-tight sm:text-[2.5rem]">
        We can&rsquo;t load this page just now.
      </h1>

      <p className="mt-5 text-[color:var(--color-ink-700)]">
        This is our end, not yours, and it is usually brief. Nothing you were doing has been lost —
        any booking you have already made is safe.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="btn-brand tracked">
          Try again
        </button>
        <a
          href="/"
          className="tracked inline-flex items-center justify-center border border-[color:var(--color-sand-300)] px-7 py-[0.95rem] hover:bg-[color:var(--color-sand-100)]"
        >
          Back to the start
        </a>
      </div>

      {(phone || email) && (
        <div className="mt-10 border-t border-[color:var(--color-sand-200)] pt-8">
          <p className="eyebrow mb-3">If you need someone now</p>
          <ul className="space-y-1.5 text-sm">
            {phone && (
              <li>
                <a href={`tel:${phone.replace(/\s/g, '')}`} className="font-medium underline">
                  {phone}
                </a>
              </li>
            )}
            {email && (
              <li>
                <a href={`mailto:${email}`} className="font-medium underline">
                  {email}
                </a>
              </li>
            )}
          </ul>
          <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">
            Arriving today or tomorrow? Ring rather than email — someone will pick up.
          </p>
        </div>
      )}

      {error.digest && (
        <p className="mt-10 text-xs text-[color:var(--color-ink-500)]">
          If you report this, the reference is <code className="tabular-nums">{error.digest}</code>.
        </p>
      )}
    </main>
  );
}
