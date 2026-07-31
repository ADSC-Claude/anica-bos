'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SimulatePanel({ reference }: { reference: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pay(outcome: 'paid' | 'failed') {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/public/simulate-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, outcome }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Simulation failed.');
        return;
      }
      router.push(`/book/confirmation/${reference}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="rounded-xl bg-sand-100 px-3 py-2 text-xs text-cocoa-600">
        Booking reference <strong className="tracking-widest">{reference}</strong>
      </p>
      {error && <p className="text-sm text-clay-500">{error}</p>}
      <button className="btn-primary w-full" disabled={busy} onClick={() => pay('paid')}>
        {busy ? 'Processing…' : 'Simulate successful payment'}
      </button>
      <button className="btn-secondary w-full" disabled={busy} onClick={() => pay('failed')}>
        Simulate failed payment
      </button>
    </div>
  );
}
