import Link from 'next/link';

export const metadata = { title: 'Page not found' };

/** Prerendered static, so it must not read from the database. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">404</p>
      <h1 className="display text-balance text-[2rem] leading-tight sm:text-[2.5rem]">There&rsquo;s nothing at this link.</h1>
      <p className="mt-5 text-[color:var(--color-ink-700)]">
        The invitation may have expired, the link may have been mistyped, or it has not been published yet. If someone sent you this link, ask them for a fresh one.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary">Back to the start</Link>
        <Link href="/#templates" className="btn btn-secondary">See the templates</Link>
      </div>
    </main>
  );
}
