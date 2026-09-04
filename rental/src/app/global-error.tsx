'use client';

/**
 * The last line of defence: this replaces the root layout, so it renders when
 * even the layout failed. That means no globals.css, no fonts, no site chrome —
 * every style here is inline, and nothing is imported that could itself throw.
 *
 * `getSettings()` already falls back to defaults rather than throwing, so the
 * layout should not fail. This exists for the case that proves that wrong.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f6f1e8',
          color: '#26332c',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          lineHeight: 1.55,
          padding: '2rem 1.25rem',
        }}
      >
        <main style={{ maxWidth: '32rem' }}>
          <p
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.28em',
              fontSize: '0.625rem',
              color: '#6b6a61',
              margin: '0 0 1rem',
            }}
          >
            Something went wrong
          </p>

          <h1
            style={{
              fontFamily: '"Hoefler Text", Baskerville, Georgia, serif',
              fontWeight: 400,
              fontSize: '2rem',
              lineHeight: 1.15,
              letterSpacing: '-0.015em',
              margin: '0 0 1.25rem',
            }}
          >
            The site is having a moment.
          </h1>

          <p style={{ margin: '0 0 2rem', color: '#4a5a50' }}>
            This is our end, not yours. Nothing you have booked is affected.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              background: '#2f4a3c',
              color: '#fff',
              border: 0,
              cursor: 'pointer',
              padding: '0.95rem 1.75rem',
              fontSize: '0.7rem',
              fontWeight: 500,
              letterSpacing: '0.15em',
              textIndent: '0.15em',
              textTransform: 'uppercase',
              fontFamily: 'inherit',
            }}
          >
            Try again
          </button>

          {error.digest && (
            <p style={{ marginTop: '2.5rem', fontSize: '0.75rem', color: '#6b6a61' }}>
              Reference: <code>{error.digest}</code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
