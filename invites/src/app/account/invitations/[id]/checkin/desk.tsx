'use client';

import { useState, useTransition } from 'react';
import { checkInAction, setArrivedAction } from '@/app/account/actions';
import { headsArrived, arrivalLabel } from '@/lib/seats';

type G = {
  id: string;
  name: string;
  groupName: string;
  seats: number;
  state: 'waiting' | 'accepted' | 'declined';
  table: string;
  checkedIn: boolean;
  /** The door's own headcount. Null means nobody gave one. */
  arrived: number | null;
  /** Who they said they were bringing, from their reply. */
  companions: string[];
  token: string;
};

// What a guest's reply means to whoever is on the door. A decline is not a
// blank: somebody who said no and came anyway is still let in, but the desk has
// to say so before a coordinator lays places for them. "Waiting" used to look
// identical to "declined" here, and both looked like an acceptance.
const STATE: Record<G['state'], { label: string; pill: string } | null> = {
  accepted: null,
  waiting: { label: 'No reply', pill: 'pill-muted' },
  declined: { label: 'Declined', pill: 'pill-bad' },
};

/**
 * What the desk announces when somebody is let in.
 *
 * One sentence per case rather than a greeting with a clause bolted onto the
 * end of it. "Welcome, Rafael Mendoza! had declined" is what bolting it on
 * reads like: an exclamation, then a lowercase remark about a different
 * subject. A decline is not a welcome with a footnote — the exception is the
 * whole message, so it drops the greeting and reads as the flag it is.
 */
function greet(d: { name: string; seats: number; state: G['state']; table: string }) {
  const where = d.table ? ` · ${d.table}` : '';
  const seats = `${d.seats} seat${d.seats === 1 ? '' : 's'}`;
  if (d.state === 'declined') return `${d.name} — declined, no seats held${where}`;
  if (d.state === 'waiting') return `Welcome, ${d.name}! ${seats} held, no reply yet${where}`;
  return `Welcome, ${d.name}! ${seats}${where}`;
}

function arrivedOf(g: G): number {
  return headsArrived(g.seats, { checkedIn: g.checkedIn, arrivedCount: g.arrived });
}

/**
 * How many of this party walked in.
 *
 * Only ever shown on somebody already checked in, because the question it asks
 * has no answer before that. The scan already filled it with the whole party,
 * so this is touched for the tables that turned up short — which is the only
 * way a headcount survives a queue of two hundred people.
 */
function Stepper({ g, set, busy }: { g: G; set: (n: number) => void; busy: boolean }) {
  const n = arrivedOf(g);
  const btn = 'px-2.5 py-1 text-base leading-none text-[color:var(--color-plum-600)] disabled:text-[color:var(--color-sand-300)]';
  return (
    <span className="inline-flex items-center rounded-lg border border-[color:var(--color-sand-300)] bg-white">
      <button type="button" className={btn} disabled={busy || n <= 0} onClick={() => set(n - 1)} aria-label={`One fewer from ${g.name}`}>−</button>
      <span className="min-w-[6.5rem] text-center text-xs tabular-nums">{arrivalLabel(g.seats, n)}</span>
      <button type="button" className={btn} disabled={busy || n >= 99} onClick={() => set(n + 1)} aria-label={`One more from ${g.name}`}>+</button>
    </span>
  );
}

export function CheckInDesk({ invitationId, guests }: { invitationId: string; guests: G[] }) {
  const [pending, start] = useTransition();
  const [q, setQ] = useState('');
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  // What this device has just done, ahead of the page revalidating. Every entry
  // is the number the server sent back rather than a guess, so it is the truth
  // arriving early rather than an optimistic copy that can be wrong. It does
  // mask a second phone's change to the same guest until the next reload, which
  // is the accepted cost of a stepper that responds to a tap at a door.
  const [own, setOwn] = useState<Record<string, { checkedIn: boolean; arrived: number | null }>>({});
  const rows = guests.map((g) => (own[g.id] ? { ...g, ...own[g.id] } : g));

  // Heads and parties, because they are different questions and the desk was
  // only ever answering the second. A caterer settles against people through
  // the door; the couple wants to know which families are still missing.
  const parties = rows.filter((g) => g.checkedIn).length;
  const heads = rows.reduce((n, g) => n + arrivedOf(g), 0);
  const expected = rows.reduce((n, g) => n + g.seats, 0);

  const term = q.trim().toLowerCase();
  // Companions are searchable too. They have no row and no token of their own —
  // they are names on somebody else's reply — so a pamangkin who arrives before
  // the tita holding the QR used to be unfindable, and got waved through
  // unrecorded.
  const matches = term
    ? rows.filter(
        (g) =>
          g.name.toLowerCase().includes(term) ||
          g.companions.some((c) => c.toLowerCase().includes(term)) ||
          g.token === q.trim().split('/').pop(),
      )
    : [];

  const run = (key: string, undo = false) =>
    start(async () => {
      const r = await checkInAction(invitationId, key, undo);
      if (r.ok) {
        const id = rows.find((g) => g.id === key || g.token === key || g.token === key.split('/').pop())?.id;
        if (id) setOwn((o) => ({ ...o, [id]: { checkedIn: !undo, arrived: undo ? null : r.data.arrived } }));
      }
      setLast(r.ok ? { ok: true, text: undo ? `${r.data.name} checked out.` : r.data.alreadyIn ? `${r.data.name} was already checked in.` : greet(r.data) } : { ok: false, text: r.error });
      setQ('');
    });

  const setArrived = (g: G, n: number) =>
    start(async () => {
      const r = await setArrivedAction(invitationId, g.id, n);
      if (!r.ok) { setLast({ ok: false, text: r.error }); return; }
      setOwn((o) => ({ ...o, [g.id]: { checkedIn: true, arrived: r.data.arrived } }));
      setLast({ ok: true, text: `${r.data.name} — ${arrivalLabel(r.data.seats, r.data.arrived)}.` });
    });

  const who = (g: G) => (
    <span>
      {g.name}
      {STATE[g.state] && <span className={`pill ${STATE[g.state]!.pill} ml-2`}>{STATE[g.state]!.label}</span>}
      <span className="block text-xs text-[color:var(--color-ink-500)]">
        {[g.groupName, g.table, `${g.seats} seat${g.seats === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
      </span>
      {g.companions.length > 0 && (
        <span className="block text-xs text-[color:var(--color-ink-500)]">with {g.companions.join(', ')}</span>
      )}
    </span>
  );

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
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                {who(g)}
                {g.checkedIn ? (
                  <span className="flex items-center gap-2">
                    <Stepper g={g} set={(n) => setArrived(g, n)} busy={pending} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => run(g.id, true)} disabled={pending}>Undo</button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => run(g.id)} disabled={pending}>Check in</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-sm text-[color:var(--color-ink-500)]">
        <b className="text-[color:var(--color-ink-900)] tabular-nums">{heads}</b> of{' '}
        <b className="text-[color:var(--color-ink-900)] tabular-nums">{expected}</b> guests in ·{' '}
        <b className="text-[color:var(--color-ink-900)] tabular-nums">{parties}</b> of{' '}
        <b className="text-[color:var(--color-ink-900)] tabular-nums">{rows.length}</b> parties
      </p>

      <div className="card overflow-x-auto">
        <table className="data">
          <thead><tr><th>Guest</th><th>Group</th><th>Table</th><th>Seats</th><th>Arrived</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id}>
                <td>
                  {g.name}
                  {STATE[g.state] && <span className={`pill ${STATE[g.state]!.pill} ml-2`}>{STATE[g.state]!.label}</span>}
                  {g.companions.length > 0 && <span className="block text-xs text-[color:var(--color-ink-500)]">with {g.companions.join(', ')}</span>}
                </td>
                <td>{g.groupName}</td>
                <td>{g.table}</td>
                <td>{g.seats}</td>
                <td>{g.checkedIn ? <Stepper g={g} set={(n) => setArrived(g, n)} busy={pending} /> : <span className="text-[color:var(--color-ink-500)]">—</span>}</td>
                <td>
                  {g.checkedIn
                    ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => run(g.id, true)} disabled={pending}>Undo</button>
                    : <button type="button" className="btn btn-ghost btn-sm" onClick={() => run(g.id)} disabled={pending}>Check in</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
