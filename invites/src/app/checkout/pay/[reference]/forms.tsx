'use client';

import { useState, useTransition } from 'react';
import { payOnlineAction, uploadProofAction } from '../../actions';

export function PayOnlineButton({ reference, simulated }: { reference: string; simulated: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <div className="mt-3">
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              await payOnlineAction(reference);
            } catch (e) {
              const msg = String((e as Error)?.message ?? '');
              if (!msg.includes('NEXT_REDIRECT')) setError(msg || 'Could not start the payment.');
            }
          })
        }
      >
        {pending ? 'Opening checkout…' : 'Pay now'}
      </button>
      {simulated && <p className="hint">Simulated gateway (no PayMongo key set) — you will see a test checkout page.</p>}
      {error && <p className="hint text-[color:var(--bad)]">{error}</p>}
    </div>
  );
}

export function ProofForm({ reference, channels }: { reference: string; channels: string[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError('');
        start(async () => {
          const res = await uploadProofAction(reference, fd);
          if (res && !res.ok) setError(res.error);
        });
      }}
    >
      <div>
        <label className="label" htmlFor="channel">Paid via</label>
        <select id="channel" name="channel" className="field">
          {channels.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="payerName">Name on the account you sent from</label>
        <input id="payerName" name="payerName" required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="payerReference">Reference number <span className="font-normal text-[color:var(--color-ink-500)]">(optional)</span></label>
        <input id="payerReference" name="payerReference" className="field" />
      </div>
      <div>
        <label className="label" htmlFor="proof">Screenshot of the receipt</label>
        <input id="proof" name="proof" type="file" accept="image/*,.pdf" required className="field" />
        <p className="hint">JPEG, PNG or PDF, up to 10 MB.</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-[#fbe9e7] px-3 py-2 text-sm text-[#8f1d17]">{error}</p>}
      <button type="submit" className="btn btn-secondary w-full" disabled={pending}>
        {pending ? 'Uploading…' : 'Submit proof of payment'}
      </button>
    </form>
  );
}
