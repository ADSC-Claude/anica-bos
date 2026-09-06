'use client';

/** Replaces the root layout when even that failed: inline styles only. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fbf8f3', color: '#1f1d1a', fontFamily: 'ui-sans-serif, system-ui, sans-serif', padding: '2rem 1.25rem' }}>
        <main style={{ maxWidth: '32rem' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '2rem', margin: '0 0 1rem' }}>The site is having a moment.</h1>
          <p style={{ margin: '0 0 2rem', color: '#4a4640' }}>This is our end, not yours. Nothing you have bought is affected.</p>
          <button type="button" onClick={reset} style={{ background: '#8a3b4e', color: '#fff', border: 0, cursor: 'pointer', padding: '0.85rem 1.5rem', borderRadius: '0.625rem', fontWeight: 600 }}>Try again</button>
          {error.digest && <p style={{ marginTop: '2rem', fontSize: '0.75rem', color: '#6b665e' }}>Reference: <code>{error.digest}</code></p>}
        </main>
      </body>
    </html>
  );
}
