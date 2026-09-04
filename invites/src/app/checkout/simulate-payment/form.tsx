'use client';

import { useState } from 'react';

export function SimulateForm({ reference, orderReference }: { reference: string; orderReference: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function pay(channel: string) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/public/simulate-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, channel }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Simulated payment failed.');
      window.location.href = `/checkout/confirm/${orderReference}`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      {error && <p className="rounded bg-[#fbe9e7] p-2 text-sm text-[color:var(--bad)]">{error}</p>}
      {['GCash', 'Maya', 'Card'].map((c) => (
        <button key={c} className="btn btn-primary w-full" type="button" onClick={() => pay(c)} disabled={busy}>
          {busy ? 'Paying…' : `Pay with ${c} (simulated)`}
        </button>
      ))}
      <a className="btn btn-secondary w-full" href={`/checkout/pay/${orderReference}?cancelled=1`}>Cancel</a>
      <p className="text-center text-xs text-[color:var(--color-ink-500)]">Payment ref {reference}</p>
    </div>
  );
}
