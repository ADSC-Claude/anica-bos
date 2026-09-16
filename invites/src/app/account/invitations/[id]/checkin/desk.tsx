'use client';

import { useState, useTransition } from 'react';
import { checkInAction, setArrivedAction } from '@/app/account/actions';
import { Scanner } from './scanner';
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
  /** What they chose to eat, and anything the kitchen has to know. */
  meal: string;
  dietary: string;
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

/** Initials in a circle, because we hold no photograph of anybody's guests. */
function Monogram({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <span className="desk-monogram" aria-hidden="true">{initials || '?'}</span>;
}

/**
 * Who you are about to let in, before you let them in.
 *
 * The desk used to check somebody in on the first tap. That is one tap fewer
 * and it is the wrong trade: the person on the door is looking at a queue, not
 * at the screen, and the row they meant is one line above the row they hit.
 * This is the screen that makes the mistake visible while it is still free —
 * and it is where the kitchen's questions get answered, because the meal and
 * the allergy are on it.
 */
function Review({ g, onCheckIn, onBack, busy }: { g: G; onCheckIn: () => void; onBack: () => void; busy: boolean }) {
  const state = STATE[g.state];
  const rows: [string, string][] = [
    ['Party', `${g.seats} seat${g.seats === 1 ? '' : 's'}${g.companions.length ? ` · with ${g.companions.join(', ')}` : ''}`],
    ['Table', g.table],
    ['Group', g.groupName],
    ['Meal', g.meal],
    ['Kitchen', g.dietary],
  ];
  return (
    <div className="desk-stage">
      <button type="button" className="desk-back" onClick={onBack}>← Back</button>
      <Monogram name={g.name} />
      <h2 className="desk-name">{g.name}</h2>
      <span className={`pill ${state ? state.pill : 'pill-ok'}`}>{state ? state.label : 'Confirmed'}</span>
      <dl className="desk-rows">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
        {!g.dietary && <div><dt>Kitchen</dt><dd className="desk-quiet">No special requests</dd></div>}
      </dl>
      {g.checkedIn ? (
        <p className="desk-already">Already checked in.</p>
      ) : (
        <button type="button" className="btn desk-go" onClick={onCheckIn} disabled={busy}>
          {busy ? 'Checking in…' : '✓  Check in'}
        </button>
      )}
    </div>
  );
}

/** The screen that says it worked, big enough to read at arm's length. */
function Done({ text, onAnother, onScan }: { text: string; onAnother: () => void; onScan: () => void }) {
  return (
    <div className="desk-stage desk-done">
      <span className="desk-tick" aria-hidden="true">✓</span>
      <h2 className="desk-name">Checked in</h2>
      <p className="desk-said">{text}</p>
      <button type="button" className="btn btn-primary desk-go" onClick={onScan}>Scan the next guest</button>
      <button type="button" className="desk-link" onClick={onAnother}>Find someone by name</button>
    </div>
  );
}

export function CheckInDesk({ invitationId, guests }: { invitationId: string; guests: G[] }) {
  const [pending, start] = useTransition();
  const [q, setQ] = useState('');
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  // Three screens rather than one form: who is this, then let them in, then
  // say so. `review` is the guest under the desk's nose; `done` is the
  // confirmation it worked, which a queue needs to see from arm's length.
  const [review, setReview] = useState<G | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
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
      const text = r.ok
        ? undo ? `${r.data.name} checked out.` : r.data.alreadyIn ? `${r.data.name} was already checked in.` : greet(r.data)
        : r.error;
      setLast({ ok: r.ok, text });
      // A successful let-in earns the confirmation screen; an undo and a
      // failure stay on the list, where the desk can try again.
      if (r.ok && !undo) { setDone(text); setReview(null); }
      setQ('');
    });

  /** Straight to the review screen, whatever found them. */
  const open = (g: G) => { setReview(g); setDone(null); setLast(null); setQ(''); setScanning(false); };

  /**
   * A code came off the camera.
   *
   * It resolves against this invitation's own guests, so a pass from another
   * wedding — or last year's, still in somebody's photos — says so rather than
   * checking a stranger in.
   */
  const scanned = (token: string) => {
    const g = rows.find((x) => x.token === token);
    if (g) { open(g); return; }
    setScanning(false);
    setLast({ ok: false, text: 'That code is not on this guest list.' });
  };

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

  if (scanning) {
    return (
      <div className="space-y-4">
        <Scanner onFound={scanned} onClose={() => setScanning(false)} />
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Done text={done} onAnother={() => setDone(null)} onScan={() => { setDone(null); setScanning(true); }} />
      </div>
    );
  }
  if (review) {
    const fresh = rows.find((g) => g.id === review.id) ?? review;
    return (
      <div className="space-y-4">
        <Review g={fresh} busy={pending} onBack={() => setReview(null)} onCheckIn={() => run(fresh.id)} />
        {last && !last.ok && <p className="text-center text-sm text-[color:var(--bad)]" role="alert">{last.text}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        {/* The camera first, because it is the fast path and the one a
            coordinator uses two hundred times. Typing stays underneath it for
            the pamangkin with no code and the phone that will not focus. */}
        <button type="button" className="btn desk-scan" onClick={() => { setScanning(true); setLast(null); }}>
          <span aria-hidden="true">▣</span> Scan a guest’s QR
        </button>
        <p className="desk-or">or find them by name</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (matches.length === 1) open(matches[0]); }}>
          <input className="field" placeholder="Paste a scanned link, or type a name" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <button type="submit" className="btn btn-primary" disabled={pending || matches.length !== 1}>Find</button>
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
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => open(g)} disabled={pending}>Open</button>
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
                    : <button type="button" className="btn btn-ghost btn-sm" onClick={() => open(g)} disabled={pending}>Open</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
