'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ProofUpload({ reference }: { reference: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(e.currentTarget);
    form.set('reference', reference);
    try {
      const res = await fetch('/api/public/proof', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Upload failed.');
      else router.refresh();
    } catch {
      setError('Upload failed. Please check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card-pad space-y-3">
      <p className="section-title">Upload your proof of payment</p>
      <label className="block">
        <span className="label">Reference number from your receipt *</span>
        <input name="refNumber" className="input" required placeholder="e.g. 1234567890123" />
      </label>
      <label className="block">
        <span className="label">Screenshot or photo *</span>
        <input
          name="proof"
          type="file"
          accept="image/*"
          required
          className="input py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-cocoa-600 file:px-3 file:py-1.5 file:text-white"
        />
        <span className="mt-1 block text-[11px] text-cocoa-400">Max 1.5 MB.</span>
      </label>
      {error && <p className="text-sm text-clay-500">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Uploading…' : 'Send proof of payment'}
      </button>
    </form>
  );
}
