'use client';

import Link from 'next/link';
import { useState, useTransition, type DragEvent } from 'react';
import type { SeatReply } from '@/lib/seats';
import { seatRows, seatingStats } from '@/lib/seating';
import type { TableShape } from '@/lib/guests';
import { saveTableAction, deleteTableAction, assignTableAction } from '@/app/account/actions';

type Guest = { id: string; name: string; groupName: string; seatsAllotted: number; tableId: string | null; response: SeatReply | null };
type Table = { id: string; name: string; capacity: number; shape: TableShape };
type ShapeOption = { value: TableShape; label: string };

/**
 * The chart itself: an Add-a-table card, a search box, one card per table
 * with its chairs numbered, and the Unassigned list at the end.
 *
 * Every way of seating somebody — a drop, the Move… select, the Add guest
 * select — is the same call, assignTableAction, so a customer on a phone,
 * where dragging is awkward, can do everything the drag does. The chip a drag
 * carries is the guest's id and nothing else; the card it lands on decides
 * the table.
 */

/** What a dragged chip carries, and the one type it is read back as. */
const DRAG_TYPE = 'text/plain';
/** The Unassigned card as a drop target and a Move… choice; a table id is a cuid and can never be this. */
const UNASSIGNED = 'unassigned';

const declined = (g: Guest) => g.response?.response === 'DECLINE';

/**
 * A table's shape, drawn rather than named: a ring for a round table, a
 * wider box for a rectangle, a long thin one for a banquet table. An icon
 * would need a legend; the outline is the legend.
 */
function ShapeGlyph({ shape }: { shape: TableShape }) {
  const cls = shape === 'round' ? 'h-7 w-7 rounded-full' : shape === 'rectangle' ? 'h-5 w-9 rounded-md' : 'h-3.5 w-12 rounded-sm';
  return <span aria-hidden className={`inline-block shrink-0 border-2 border-[color:var(--color-plum-500)] ${cls}`} />;
}

export function SeatingChart({ invitationId, tables, guests, shapes }: { invitationId: string; tables: Table[]; guests: Guest[]; shapes: ShapeOption[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) =>
    start(async () => {
      setError('');
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Something went wrong.');
      else done?.();
    });

  const stats = seatingStats(tables, guests);
  const at = (tableId: string) => guests.filter((g) => g.tableId === tableId);
  const unseated = guests.filter((g) => !g.tableId);

  // The search reads names wherever they are: a table's own, the names seated
  // at it, and the names still waiting. A table stays on screen if anything
  // about it matches, so "Dela Cruz" shows the table they are at.
  const q = filter.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);
  const visibleTables = tables.filter((t) => matches(t.name) || at(t.id).some((g) => matches(g.name)));
  const visibleUnseated = unseated.filter((g) => matches(g.name));

  const seat = (guestId: string, tableId: string | null) => {
    const g = guests.find((x) => x.id === guestId);
    if (!g || g.tableId === tableId) return;
    run(() => assignTableAction(invitationId, guestId, tableId));
  };

  const dragStart = (guestId: string) => (e: DragEvent<HTMLElement>) => {
    e.dataTransfer.setData(DRAG_TYPE, guestId);
    e.dataTransfer.effectAllowed = 'move';
  };
  // A card lights up while a chip is over it. dragleave fires on the way into
  // every child too, so the light only goes out when the pointer has actually
  // left the card.
  const dropOn = (tableId: string | null) => {
    const key = tableId ?? UNASSIGNED;
    return {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (over !== key) setOver(key);
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        setOver(null);
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (id) seat(id, tableId);
      },
    };
  };
  const lit = (key: string) => (over === key ? 'ring-2 ring-[color:var(--color-plum-500)]' : '');

  const remove = (t: Table) => {
    const n = at(t.id).length;
    const message = n === 0
      ? `Delete ${t.name}?`
      : n === 1
        ? `Delete ${t.name}? The guest seated there goes back to Unassigned.`
        : `Delete ${t.name}? The ${n} guests seated there go back to Unassigned.`;
    if (window.confirm(message)) run(() => deleteTableAction(invitationId, t.id));
  };

  return (
    <div className="space-y-4">
      <form
        className="card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          run(() => saveTableAction(invitationId, new FormData(form)), () => form.reset());
        }}
      >
        <h2 className="font-semibold">Add a table</h2>
        <p className="mt-1 text-sm text-[color:var(--color-ink-500)]">Name it the way the place cards will read it. Seats is how many chairs it has.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_9rem_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="new-table-name">Name <span className="font-normal text-[color:var(--color-ink-500)]">(required)</span></label>
            <input id="new-table-name" name="name" className="field" placeholder="Table 1, or Bride’s family" required maxLength={60} />
          </div>
          <div>
            <label className="label" htmlFor="new-table-capacity">Seats</label>
            <input id="new-table-capacity" name="capacity" type="number" min={1} max={50} defaultValue={8} className="field" required />
          </div>
          <div>
            <label className="label" htmlFor="new-table-shape">Shape</label>
            <select id="new-table-shape" name="shape" className="field" defaultValue="round">
              {shapes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending}>+ Add table</button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <input type="search" className="field max-w-sm" placeholder="Search guests or tables…" aria-label="Search guests or tables" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {error && <span role="alert" className="text-sm text-[color:var(--bad)]">{error}</span>}
      </div>

      {tables.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[color:var(--color-sand-300)] p-6 text-center text-sm text-[color:var(--color-ink-500)]">No tables yet — add your first one above. Guests from your Guest list wait in the Unassigned list below, ready to seat.</p>
      ) : visibleTables.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[color:var(--color-sand-300)] p-6 text-center text-sm text-[color:var(--color-ink-500)]">No table or seated guest matches “{filter.trim()}”.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleTables.map((t) => (
            <TableCard
              key={t.id}
              table={t}
              seated={at(t.id)}
              count={stats.byTable[t.id]?.seated ?? 0}
              others={tables.filter((o) => o.id !== t.id)}
              unseated={unseated}
              shapes={shapes}
              pending={pending}
              editing={editing === t.id}
              lit={lit(t.id)}
              drop={dropOn(t.id)}
              dragStart={dragStart}
              onEdit={() => setEditing(t.id)}
              onCancel={() => setEditing(null)}
              onSave={(fd) => run(() => saveTableAction(invitationId, fd), () => setEditing(null))}
              onDelete={() => remove(t)}
              onMove={seat}
            />
          ))}
        </div>
      )}

      <section className={`card p-4 ${lit(UNASSIGNED)}`} {...dropOn(null)}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Unassigned</h2>
          <span className={`pill ${unseated.length ? 'pill-info' : 'pill-muted'}`}>{unseated.length} not seated yet</span>
        </div>
        <p className="mt-1 text-sm text-[color:var(--color-ink-500)]">Drag a name onto a table, or pick it from the table’s Add guest list.</p>
        {guests.length === 0 ? (
          <p className="mt-3 text-sm">
            Nobody to seat yet. Add your guests on the <Link href={`/account/invitations/${invitationId}/guests`} className="underline">Guest list</Link> tab and they appear here, ready to seat.
          </p>
        ) : unseated.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--color-ink-500)]">Everyone on your list has a table. Drop a name here to take them off theirs.</p>
        ) : visibleUnseated.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--color-ink-500)]">Nobody waiting matches “{filter.trim()}”.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {visibleUnseated.map((g) => (
              <li key={g.id}>
                <span draggable onDragStart={dragStart(g.id)} className="pill pill-muted cursor-grab select-none py-1" title="Drag onto a table">
                  <span className={declined(g) ? 'line-through' : undefined}>{g.name}</span>
                  {g.groupName && <span className="font-normal text-[color:var(--color-ink-500)]">· {g.groupName}</span>}
                  {declined(g) && <span className="font-normal text-[color:var(--color-ink-500)]">· not coming</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * One table: its shape, its name, how full it is, and a numbered row per
 * chair. Everybody seated here can be moved from their row; anybody not yet
 * seated can be added from the select at the foot. Edit swaps the header for
 * the same three fields the Add-a-table card asks for.
 */
function TableCard({ table: t, seated, count, others, unseated, shapes, pending, editing, lit, drop, dragStart, onEdit, onCancel, onSave, onDelete, onMove }: {
  table: Table;
  seated: Guest[];
  count: number;
  others: Table[];
  unseated: Guest[];
  shapes: ShapeOption[];
  pending: boolean;
  editing: boolean;
  lit: string;
  drop: { onDragOver: (e: DragEvent<HTMLElement>) => void; onDragLeave: (e: DragEvent<HTMLElement>) => void; onDrop: (e: DragEvent<HTMLElement>) => void };
  dragStart: (guestId: string) => (e: DragEvent<HTMLElement>) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (fd: FormData) => void;
  onDelete: () => void;
  onMove: (guestId: string, tableId: string | null) => void;
}) {
  const rows = seatRows(t.capacity, seated);
  const full = count > t.capacity;
  return (
    <section className={`card p-4 ${lit}`} {...drop} aria-label={t.name}>
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); onSave(new FormData(e.currentTarget)); }}>
          <input type="hidden" name="id" value={t.id} />
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_8rem]">
            <div>
              <label className="label" htmlFor={`name-${t.id}`}>Name</label>
              <input id={`name-${t.id}`} name="name" defaultValue={t.name} className="field" required maxLength={60} />
            </div>
            <div>
              <label className="label" htmlFor={`capacity-${t.id}`}>Seats</label>
              <input id={`capacity-${t.id}`} name="capacity" type="number" min={1} max={50} defaultValue={t.capacity} className="field" required />
            </div>
            <div>
              <label className="label" htmlFor={`shape-${t.id}`}>Shape</label>
              <select id={`shape-${t.id}`} name="shape" defaultValue={t.shape} className="field">
                {shapes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>Save</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      ) : (
        <header className="flex items-center gap-3">
          <ShapeGlyph shape={t.shape} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">{t.name}</h3>
            <span className={`pill ${full ? 'pill-bad' : 'pill-muted'}`}>{count}/{t.capacity} seats{full ? ' — over' : ''}</span>
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit} disabled={pending}>Edit</button>
            <button type="button" className="btn btn-ghost btn-sm text-[color:var(--bad)]" onClick={onDelete} disabled={pending}>Delete</button>
          </div>
        </header>
      )}

      <ol className="mt-3 space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.seat} className="flex min-h-7 items-center gap-2">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[color:var(--color-ink-500)]">{r.seat}</span>
            {r.guest === null ? (
              <span className="text-[color:var(--color-ink-500)]">—</span>
            ) : r.first ? (
              <>
                <span draggable onDragStart={dragStart(r.guest.id)} className="min-w-0 flex-1 cursor-grab select-none" title="Drag to another table, or to Unassigned">
                  <span className={declined(r.guest) ? 'text-[color:var(--color-ink-500)] line-through' : undefined}>{r.guest.name}</span>
                  {r.guest.groupName && <span className="ml-1 text-xs text-[color:var(--color-ink-500)]">{r.guest.groupName}</span>}
                  {declined(r.guest) && <span className="ml-1 text-xs text-[color:var(--color-ink-500)]">not coming</span>}
                </span>
                {/* `.field` is width: 100% outside any layer, so a width
                    utility cannot narrow it; the style can. */}
                <select
                  aria-label={`Move ${r.guest.name}`}
                  className="field min-h-0 shrink-0 py-1 text-xs"
                  style={{ width: '7rem' }}
                  value=""
                  disabled={pending}
                  onChange={(e) => { const v = e.target.value; if (v && r.guest) onMove(r.guest.id, v === UNASSIGNED ? null : v); }}
                >
                  <option value="">Move…</option>
                  {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  <option value={UNASSIGNED}>Unassigned</option>
                </select>
              </>
            ) : (
              <span className="text-[color:var(--color-ink-500)]">with {r.guest.name}</span>
            )}
          </li>
        ))}
      </ol>

      <select
        aria-label={`Add a guest to ${t.name}`}
        className="field mt-3 text-sm"
        value=""
        disabled={pending || unseated.length === 0}
        onChange={(e) => { if (e.target.value) onMove(e.target.value, t.id); }}
      >
        <option value="">{unseated.length ? 'Add guest…' : 'Everyone is seated'}</option>
        {unseated.map((g) => <option key={g.id} value={g.id}>{g.name}{g.groupName ? ` · ${g.groupName}` : ''}</option>)}
      </select>
    </section>
  );
}
