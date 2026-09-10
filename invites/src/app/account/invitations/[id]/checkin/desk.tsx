'use client';

import { useState, useTransition } from 'react';
import { checkInAction } from '@/app/account/actions';

type G = { id: string; name: string; groupName: string; seats: number; state: 'waiting' | 'accepted' | 'declined'; table: string; checkedIn: boolean; token: string };

// What a guest's reply means to whoever is on the door. A decline is not a
// blank: somebody who said no and came anyway is still let in, but the desk has
// to say so before a coordinator lays places for them. "Waiting" used to look
// identical to "declined" here, and both looked like an acceptance.
const STATE: Record<G['state'], { label: string; pill: string } | null> = {
  accepted: null,
  waiting: { label: 'No reply', pill: 'pill-muted' },
  declined: { label: 'Declined', pill: 'pill-bad' },
};

export function CheckInDesk({ invitationId, guests }: { invitationId: string; guests: G[] }) {
  const [pending, start] = useTransition();
  const [q, setQ] = useState('');
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  const inCount = guests.filter((g) => g.checkedIn).length;
  const matches = q.trim() ? guests.filter((g) => g.name.toLowerCase().includes(q.toLowerCase()) || g.token === q.trim().split('/').pop()) : [];

  const run = (key: string, undo = false) =>
    start(async () => {
      const r = await checkInAction(invitationId, key, undo);
      setLast(r.ok ? { ok: true, text: undo ? `${r.data.name} checked out.` : r.data.alreadyIn ? `${r.data.name} was already checked in.` : `Welcome, ${r.data.name}! ${r.data.state === 'declined' ? 'had declined — no seats held' : `${r.data.seats} seat${r.data.seats === 1 ? '' : 's'}`}${r.data.table ? ` · ${r.data.table}` : ''}` } : { ok: false, text: r.error });
      setQ('');
    });

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (matches.length === 1) run(matches[0].token); else if (q.includes('/')) run(q); }}>
          <input className="field" placeholder="Paste a scanned link, or type a name" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <button type="submit" className="btn btn-primary" disabled={pending}>Check in</button>
        </form>
        {last && <p className={`mt-2 text-lg ${last.ok ? 'text-[color:var(--ok)]' : 'text-[color:var(--bad)]'}`} role="status">{last.text}</p>}
        {matches.length > 0 && (
          <ul className="mt-3 divide-y divide-[color:var(--color-sand-100)]">
            {matches.slice(0, 20).map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{g.name}{STATE[g.state] && <span className={`pill ${STATE[g.state]!.pill} ml-2`}>{STATE[g.state]!.label}</span>}<span className="block text-xs text-[color:var(--color-ink-500)]">{[g.groupName, g.table, `${g.seats} seat${g.seats === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span></span>
                {g.checkedIn ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => run(g.id, true)} disabled={pending}>Undo</button> : <button type="button" className="btn btn-primary btn-sm" onClick={() => run(g.id)} disabled={pending}>Check in</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-sm text-[color:var(--color-ink-500)]">{inCount} of {guests.length} checked in.</p>
      <div className="card overflow-x-auto">
        <table className="data">
          <thead><tr><th>Guest</th><th>Group</th><th>Table</th><th>Seats</th><th>Status</th></tr></thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id}><td>{g.name}{STATE[g.state] && <span className={`pill ${STATE[g.state]!.pill} ml-2`}>{STATE[g.state]!.label}</span>}</td><td>{g.groupName}</td><td>{g.table}</td><td>{g.seats}</td><td>{g.checkedIn ? <span className="pill pill-ok">Checked in</span> : <button type="button" className="btn btn-ghost btn-sm" onClick={() => run(g.id)} disabled={pending}>Check in</button>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
