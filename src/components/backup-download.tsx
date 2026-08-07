'use client';

import { useState } from 'react';
import { MIN_PASSPHRASE_LENGTH } from '@/lib/passphrase';

/**
 * The full-backup download, which now asks for a passphrase.
 *
 * A plain form posting to the route would work, but the response is a file and
 * the errors are JSON — a failed post would navigate the owner away from
 * Settings to a page of raw JSON explaining that their passphrases did not
 * match. So the request is made here and the blob is saved from the response,
 * which keeps the mistake on the screen where it can be corrected.
 */
export function BackupDownload() {
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function download(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setDone(false);

    if (passphrase !== confirm) {
      setError('The two passphrases do not match.');
      return;
    }
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      setError(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.set('passphrase', passphrase);
      body.set('passphraseConfirm', confirm);

      const res = await fetch('/api/portal/backup', { method: 'POST', body });
      if (!res.ok) {
        const message = await res
          .json()
          .then((j: { error?: string }) => j.error)
          .catch(() => null);
        setError(message ?? 'The backup could not be produced.');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anica-backup-${new Date().toISOString().slice(0, 10)}.json.enc`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setPassphrase('');
      setConfirm('');
      setDone(true);
    } catch {
      setError('The backup could not be produced. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={download} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-cocoa-600">Passphrase</span>
          <input
            type="password"
            className="input mt-1"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSPHRASE_LENGTH} characters`}
            required
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-cocoa-600">Type it again</span>
          <input
            type="password"
            className="input mt-1"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
      </div>

      <p className="text-xs text-cocoa-400">
        There is no way to recover this passphrase and no way to open the file without it. Keep it
        somewhere that is not the drive holding the backup.
      </p>

      {error && (
        <p className="rounded-lg bg-clay-500/10 px-2 py-1.5 text-xs text-clay-500">{error}</p>
      )}
      {done && (
        <p className="rounded-lg bg-cocoa-100 px-2 py-1.5 text-xs text-cocoa-700">
          Downloaded. Try restoring it once, on a spare database — a backup nobody has ever restored
          is a hope, not a backup.
        </p>
      )}

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Preparing…' : '↓ Download encrypted backup'}
      </button>
    </form>
  );
}
