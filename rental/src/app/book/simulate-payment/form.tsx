'use client';

import { useState } from 'react';

export function SimulateForm({
  reference,
  bookingReference,
}: {
  reference: string;
  bookingReference: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/public/simulate-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: bookingReference }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Simulated payment failed.');
      window.location.href = `/book/confirmation/${bookingReference}`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="rounded bg-[#fbe9e7] p-2 text-sm text-[color:var(--bad)]">{error}</p>}
      <button className="btn btn-primary w-full" type="button" onClick={pay} disabled={busy}>
        {busy ? 'Paying…' : 'Pay now (simulated)'}
      </button>
      <a className="btn btn-secondary w-full" href={`/book/pay/${bookingReference}?cancelled=1`}>
        Cancel
      </a>
      <p className="text-center text-xs text-[color:var(--color-ink-500)]">Payment ref {reference}</p>
    </div>
  );
}
