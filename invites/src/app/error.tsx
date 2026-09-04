'use client';

import { useEffect } from 'react';

/**
 * What a guest sees when a page cannot be rendered. Assumes nothing: no data,
 * no settings. The contact details come from build-time environment variables
 * because the database is the thing most likely to be down.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[page error]', error.digest ?? '(no digest)', error);
  }, [error]);

  const messenger = process.env.NEXT_PUBLIC_CONTACT_MESSENGER;
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">Something went wrong</p>
      <h1 className="display text-balance text-[2rem] leading-tight sm:text-[2.5rem]">We can&rsquo;t load this page just now.</h1>
      <p className="mt-5 text-[color:var(--color-ink-700)]">This is our end, not yours, and it is usually brief. Nothing you were doing has been lost.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">Try again</button>
        <a href="/" className="btn btn-secondary">Back to the start</a>
      </div>
      {(messenger || email) && (
        <div className="mt-10 border-t border-[color:var(--color-sand-200)] pt-8 text-sm">
          <p className="eyebrow mb-3">If you need someone now</p>
          {messenger && <p><a href={messenger} className="font-medium underline">Message us on Messenger</a></p>}
          {email && <p className="mt-1"><a href={`mailto:${email}`} className="font-medium underline">{email}</a></p>}
        </div>
      )}
      {error.digest && <p className="mt-10 text-xs text-[color:var(--color-ink-500)]">Reference: <code>{error.digest}</code></p>}
    </main>
  );
}
