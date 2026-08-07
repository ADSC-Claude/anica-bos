'use client';

/**
 * What being late costs, by how late — as a table the owner writes herself.
 *
 * The flat charge above this treats six minutes over and three hours over as
 * the same offence. These bands read the minutes that were already being
 * recorded at time-in and thrown away.
 *
 * Everything is expressed in minutes *past the grace period*, and the grace
 * figure is shown alongside in real clock times, because "16 minutes late" and
 * "16 minutes past grace" are different mornings and the difference is
 * somebody's pay.
 */

import { useState } from 'react';
import { checkBands, type LateBand } from '@/lib/late-bands';

type Row = { key: string; from: string; to: string; type: 'FIXED' | 'PERCENT'; amount: string };

let seq = 0;
const newKey = () => `b${++seq}`;

/** The rows as bands, ignoring anything half-typed. */
function toBands(rows: Row[]): LateBand[] {
  return rows
    .filter((r) => r.from !== '' && r.amount !== '')
    .map((r) => ({
      from: Math.max(0, Math.round(Number(r.from) || 0)),
      to: r.to === '' ? null : Math.round(Number(r.to)),
      type: r.type,
      // Pesos are typed with centavos; a percentage is a whole number and
      // must not be multiplied by a hundred on its way in.
      amountCents:
        r.type === 'PERCENT'
          ? Math.round(Number(r.amount) || 0)
          : Math.round((Number(r.amount) || 0) * 100),
    }));
}

/** "12:16 PM" for a given number of minutes past grace, so the band is real. */
function clockOf(openMinute: number, graceMinutes: number, pastGrace: number): string {
  const m = (openMinute + graceMinutes + pastGrace) % 1440;
  const h = Math.floor(m / 60);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m % 60).padStart(2, '0')} ${ap}`;
}

export function LateBandsEditor({
  initial,
  openMinute,
  graceMinutes,
}: {
  initial: LateBand[];
  /** The branch's opening minute, only ever used to show example times. */
  openMinute: number;
  graceMinutes: number;
}) {
  const [rows, setRows] = useState<Row[]>(
    initial.length
      ? initial.map((b) => ({
          key: newKey(),
          from: String(b.from),
          to: b.to === null ? '' : String(b.to),
          type: b.type,
          amount: b.type === 'PERCENT' ? String(b.amountCents) : (b.amountCents / 100).toFixed(2),
        }))
      : [],
  );

  const set = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const bands = toBands(rows);
  const problems = checkBands(bands);

  return (
    <div className="space-y-2">
      <span className="label">Late deduction bands</span>

      {/* One hidden field carries the lot. The server re-reads and re-validates
          it — this is a convenience, not the authority. */}
      <input type="hidden" name="lateBands" value={JSON.stringify(bands)} />

      <p className="text-[11px] leading-relaxed text-cocoa-500">
        Minutes are counted <strong>past the grace period</strong>, not past opening. With a{' '}
        {graceMinutes}-minute grace, someone arriving at{' '}
        {clockOf(openMinute, graceMinutes, 1)} is 1 minute past grace.
        {rows.length === 0 && ' Leave this empty to keep charging the flat amount above.'}
      </p>

      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={r.key} className="space-y-1">
              <div className="flex flex-wrap items-end gap-2">
                <label className="block w-24">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-cocoa-400">
                    From
                  </span>
                  <input
                    type="number" min={0} className="input" value={r.from}
                    onChange={(e) => set(r.key, { from: e.target.value })}
                  />
                </label>
                <label className="block w-24">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-cocoa-400">
                    To
                  </span>
                  <input
                    type="number" min={0} className="input" value={r.to} placeholder="and up"
                    onChange={(e) => set(r.key, { to: e.target.value })}
                  />
                </label>
                <label className="block w-40">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-cocoa-400">
                    Deduct
                  </span>
                  <select
                    className="select" value={r.type}
                    onChange={(e) => set(r.key, { type: e.target.value as Row['type'] })}
                  >
                    <option value="FIXED">Fixed ₱</option>
                    <option value="PERCENT">% of a day</option>
                  </select>
                </label>
                <label className="block w-28">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-cocoa-400">
                    {r.type === 'PERCENT' ? 'Percent' : 'Amount ₱'}
                  </span>
                  <input
                    type="number" min={0} step={r.type === 'PERCENT' ? 1 : 0.01} className="input"
                    value={r.amount}
                    onChange={(e) => set(r.key, { amount: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                  className="mb-0.5 rounded-lg border border-sand-300 px-2 py-2 text-xs text-cocoa-600 transition hover:border-clay-400 hover:text-clay-500"
                  aria-label={`Remove the band starting at ${r.from || '?'} minutes`}
                >
                  Remove
                </button>
                {r.from !== '' && (
                  <span className="mb-2.5 text-[11px] text-cocoa-400">
                    arriving {clockOf(openMinute, graceMinutes, Number(r.from) || 0)}
                    {r.to === ''
                      ? ' or later'
                      : ` – ${clockOf(openMinute, graceMinutes, Number(r.to) || 0)}`}
                  </span>
                )}
              </div>
              {problems
                .filter((p) => p.index === i)
                .map((p) => (
                  <p key={p.message} className="text-[11px] text-clay-500">{p.message}</p>
                ))}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() =>
          setRows((prev) => [
            ...prev,
            {
              key: newKey(),
              // Start where the last one left off, because that is what the
              // next band almost always is.
              from: prev.length
                ? String((Number(prev[prev.length - 1].to) || Number(prev[prev.length - 1].from) || 0) + 1)
                : '1',
              to: '',
              // The rung above is usually the right shape for the next one.
              type: prev.length ? prev[prev.length - 1].type : 'FIXED',
              amount: '',
            },
          ])
        }
        className="btn-secondary text-xs"
      >
        + Add a band
      </button>

      {rows.length > 0 && (
        <p className="text-[11px] text-cocoa-400">
          A late arrival outside every band is not charged. The flat amount above is ignored
          while any band is set. A percentage is taken from that employee&apos;s own daily
          allowance, so one ladder suits everybody.
        </p>
      )}
    </div>
  );
}
