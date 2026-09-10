'use client';

import { useMemo, useState, useTransition } from 'react';
import { seatsHeld } from '@/lib/seats';
import { addGuestAction, updateGuestAction, deleteGuestAction, importGuestsAction, importGuestFileAction, saveTableAction, deleteTableAction, assignTableAction } from '@/app/account/actions';

type Guest = { id: string; name: string; salutation: string; groupName: string; seatsAllotted: number; plusOneAllowed: boolean; phone: string; email: string; notes: string; token: string; tableId: string | null; checkedIn: boolean; response: { response: 'ACCEPT' | 'DECLINE'; seats: number } | null };
type Table = { id: string; name: string; capacity: number };

const guestSeats = (g: Guest) => seatsHeld(g.seatsAllotted, g.response);

export function GuestManager({ invitationId, slug, baseUrl, reminder, canSeating, tables, guests }: { invitationId: string; slug: string; baseUrl: string; reminder: string; canSeating: boolean; tables: Table[]; guests: Guest[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const [group, setGroup] = useState('');
  const [editing, setEditing] = useState<Guest | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [copied, setCopied] = useState('');

  const groups = useMemo(() => Array.from(new Set(guests.map((g) => g.groupName).filter(Boolean))).sort(), [guests]);
  const visible = guests.filter((g) => (!group || g.groupName === group) && (!filter || `${g.name} ${g.salutation} ${g.phone} ${g.email}`.toLowerCase().includes(filter.toLowerCase())));

  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, done?: (d: unknown) => void) =>
    start(async () => {
      setError('');
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Something went wrong.');
      else done?.(r.data);
    });

  const at = (tableId: string) => guests.filter((g) => g.tableId === tableId);
  const tableSeats = (tableId: string) => at(tableId).reduce((n, g) => n + guestSeats(g), 0);
  const unseated = guests.filter((g) => !g.tableId);

  const link = (g: Guest) => `${baseUrl}/${g.token}`;
  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(''), 1200);
    } catch {
      window.prompt('Copy', text);
    }
  }
  const message = (g: Guest) => reminder.replace('{name}', g.salutation || g.name.split(' ')[0]).replace('{link}', link(g));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="field max-w-xs" placeholder="Search guests" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select className="field max-w-[12rem]" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All groups</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ id: '', name: '', salutation: '', groupName: group, seatsAllotted: 1, plusOneAllowed: false, phone: '', email: '', notes: '', token: '', tableId: null, checkedIn: false, response: null })}>+ Add guest</button>
        <button type="button" className="btn btn-secondary" onClick={() => setShowImport((v) => !v)}>Import from Excel / paste</button>
        {error && <span role="alert" className="text-sm text-[color:var(--bad)]">{error}</span>}
        {notice && <span className="text-sm text-[color:var(--ok)]">{notice}</span>}
      </div>

      {showImport && (
        <form className="card p-4" onSubmit={(e) => { e.preventDefault(); const text = String(new FormData(e.currentTarget).get('text') ?? ''); if (!text.trim()) return; run(() => importGuestsAction(invitationId, text), (d) => { const r = d as { added: number; skipped: number }; setNotice(`Imported ${r.added} guest${r.added === 1 ? '' : 's'}${r.skipped ? `, skipped ${r.skipped} blank rows` : ''}.`); setShowImport(false); }); }}>
          <p className="text-sm">Columns: <b>Name, Group, Seats, Phone</b> (a header row is fine; <i>Greeting</i> is optional). <a href={`/account/invitations/${invitationId}/guest-template.csv`} className="underline">Download the blank list</a> — fill it in, then send it back below.</p>
          <label className="label mt-3">Upload the file</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="field text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const form = new FormData();
                form.set('file', file);
                e.target.value = '';
                run(() => importGuestFileAction(invitationId, form), (d) => {
                  const r = d as { added: number; skipped: number };
                  setNotice(`Imported ${r.added} guest${r.added === 1 ? '' : 's'}${r.skipped ? `, skipped ${r.skipped} blank rows` : ''}.`);
                  setShowImport(false);
                });
              }}
            />
            <span className="text-xs text-[color:var(--color-ink-500)]">Excel (.xlsx) or CSV. The workbook is read as it is — no need to save it as CSV first.</span>
          </div>

          <label className="label mt-4">Or paste the rows</label>
          <textarea name="text" className="field font-mono text-xs" rows={5} placeholder={'Name\tGroup\tSeats\tPhone\nMr. & Mrs. Dela Cruz\tBride\'s family\t2\t0917…'} />
          <button type="submit" className="btn btn-secondary mt-2" disabled={pending}>Import pasted rows</button>
        </form>
      )}

      {editing && (
        <form className="card p-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => (editing.id ? updateGuestAction(invitationId, editing.id, fd) : addGuestAction(invitationId, fd)), () => setEditing(null)); }}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2"><label className="label">Name</label><input name="name" className="field" defaultValue={editing.name} required /></div>
            <div><label className="label">Seats reserved</label><input name="seatsAllotted" type="number" min={1} max={20} className="field" defaultValue={editing.seatsAllotted} /></div>
            <div><label className="label">Greeting <span className="font-normal text-[color:var(--color-ink-500)]">(“Dear …”)</span></label><input name="salutation" className="field" defaultValue={editing.salutation} placeholder="Mr. & Mrs. Dela Cruz" /></div>
            <div><label className="label">Group / tag</label><input name="groupName" className="field" defaultValue={editing.groupName} list="groups" placeholder="Bride's family" /><datalist id="groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></div>
            <div><label className="label">Mobile</label><input name="phone" className="field" defaultValue={editing.phone} inputMode="tel" /></div>
            <div><label className="label">Email</label><input name="email" className="field" defaultValue={editing.email} type="email" /></div>
            {canSeating && (
              <div><label className="label">Table</label><select name="tableId" className="field" defaultValue={editing.tableId ?? ''}><option value="">— none —</option>{tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            )}
            <div className="sm:col-span-3"><label className="label">Notes</label><input name="notes" className="field" defaultValue={editing.notes} /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="plusOneAllowed" defaultChecked={editing.plusOneAllowed} className="h-4 w-4" /> Allow a plus-one beyond the reserved seats</label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={pending}>{editing.id ? 'Save' : 'Add guest'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            {editing.id && <button type="button" className="btn btn-ghost text-[color:var(--bad)]" onClick={() => { if (confirm('Remove this guest?')) run(() => deleteGuestAction(invitationId, editing.id), () => setEditing(null)); }}>Remove</button>}
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="data">
          <thead><tr><th>Guest</th><th>Group</th><th>Seats</th><th>Response</th>{canSeating && <th>Table</th>}<th>Personal link</th><th /></tr></thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={7} className="text-center text-[color:var(--color-ink-500)]">No guests yet. Add one or import a list.</td></tr>}
            {visible.map((g) => (
              <tr key={g.id}>
                <td><button type="button" className="text-left font-medium underline-offset-2 hover:underline" onClick={() => setEditing(g)}>{g.name}</button>{g.salutation && <span className="block text-xs text-[color:var(--color-ink-500)]">Dear {g.salutation}</span>}{(g.phone || g.email) && <span className="block text-xs text-[color:var(--color-ink-500)]">{[g.phone, g.email].filter(Boolean).join(' · ')}</span>}</td>
                <td>{g.groupName}</td>
                <td>{g.seatsAllotted}{g.plusOneAllowed ? ' +1' : ''}</td>
                <td>{g.response ? <span className={`pill ${g.response.response === 'ACCEPT' ? 'pill-ok' : 'pill-bad'}`}>{g.response.response === 'ACCEPT' ? `Yes · ${g.response.seats}` : 'No'}</span> : <span className="pill pill-muted">Waiting</span>}{g.checkedIn && <span className="pill pill-info ml-1">In</span>}</td>
                {canSeating && (
                  <td>
                    <select className="field min-h-0 py-1 text-xs" value={g.tableId ?? ''} onChange={(e) => run(() => assignTableAction(invitationId, g.id, e.target.value || null))}>
                      <option value="">—</option>
                      {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                )}
                <td className="whitespace-nowrap">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(link(g), g.id)}>{copied === g.id ? 'Copied' : 'Copy link'}</button>
                </td>
                <td className="whitespace-nowrap">
                  <a className="btn btn-ghost btn-sm" href={`viber://forward?text=${encodeURIComponent(message(g))}`}>Viber</a>
                  <a className="btn btn-ghost btn-sm" href={`sms:${g.phone.replace(/\s/g, '')}?&body=${encodeURIComponent(message(g))}`}>SMS</a>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(message(g), `m-${g.id}`)}>{copied === `m-${g.id}` ? 'Copied' : 'Copy message'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canSeating && (
        <div className="card p-4">
          <h2 className="font-semibold">Tables</h2>
          <p className="mb-2 text-sm text-[color:var(--color-ink-500)]">Optional — skip this if you are not doing assigned seating. Nothing on your invitation changes until you seat somebody.</p>
          <div className="flex flex-wrap gap-2">
            {tables.map((t) => (
              <form key={t.id} className="flex items-center gap-1 rounded-xl border border-[color:var(--color-sand-200)] p-2 text-sm" onSubmit={(e) => { e.preventDefault(); run(() => saveTableAction(invitationId, new FormData(e.currentTarget))); }}>
                <input type="hidden" name="id" value={t.id} />
                <input name="name" defaultValue={t.name} className="field min-h-0 w-28 py-1 text-sm" />
                <input name="capacity" type="number" defaultValue={t.capacity} className="field min-h-0 w-16 py-1 text-sm" />
                <span className={`text-xs ${tableSeats(t.id) > t.capacity ? 'text-[color:var(--bad)]' : 'text-[color:var(--color-ink-500)]'}`}>{tableSeats(t.id)}/{t.capacity}</span>
                <button type="submit" className="btn btn-ghost btn-sm">Save</button>
                <button type="button" className="btn btn-ghost btn-sm text-[color:var(--bad)]" onClick={() => run(() => deleteTableAction(invitationId, t.id))}>✕</button>
              </form>
            ))}
            <form className="flex items-center gap-1 text-sm" onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; run(() => saveTableAction(invitationId, new FormData(form)), () => form.reset()); }}>
              <input name="name" placeholder="Table 1" className="field min-h-0 w-28 py-1 text-sm" required />
              <input name="capacity" type="number" defaultValue={10} className="field min-h-0 w-16 py-1 text-sm" />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>+ Table</button>
            </form>
          </div>
        </div>

      )}

      {/*
        The plan read the other way round. The list above answers "where is this
        guest sitting"; a couple laying out a room asks "who is at this table",
        and could only get that by reading every row. Whoever has no table yet
        is the work still to do, so they are last and they carry the dropdown —
        the seating gets finished from the place that shows what is unfinished.
      */}
      {canSeating && tables.length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold">Seating plan</h2>
          <p className="mb-3 text-sm text-[color:var(--color-ink-500)]">Seats count what each guest confirmed once they reply, and what you set aside for them before that. Someone who cannot come frees their places.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((t) => (
              <div key={t.id} className="rounded-xl border border-[color:var(--color-sand-200)] p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{t.name}</span>
                  <span className={`text-xs ${tableSeats(t.id) > t.capacity ? 'text-[color:var(--bad)]' : 'text-[color:var(--color-ink-500)]'}`}>{tableSeats(t.id)}/{t.capacity} seats</span>
                </div>
                {at(t.id).length === 0 ? (
                  <p className="mt-2 text-sm text-[color:var(--color-ink-500)]">Nobody here yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {at(t.id).map((g) => (
                      <li key={g.id} className="flex items-baseline justify-between gap-2">
                        <span className={g.response?.response === 'DECLINE' ? 'text-[color:var(--color-ink-500)] line-through' : undefined}>
                          {g.name}
                          {g.groupName && <span className="ml-1 text-xs text-[color:var(--color-ink-500)]">{g.groupName}</span>}
                        </span>
                        <span className="shrink-0 text-xs text-[color:var(--color-ink-500)]">
                          {g.response?.response === 'DECLINE' ? 'not coming' : g.response ? `${g.response.seats}` : `${g.seatsAllotted} held`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {unseated.length > 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-[color:var(--color-sand-200)] p-3">
              <p className="text-sm font-semibold">Not seated yet <span className="font-normal text-[color:var(--color-ink-500)]">· {unseated.length} {unseated.length === 1 ? 'guest' : 'guests'}</span></p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {unseated.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className={g.response?.response === 'DECLINE' ? 'text-[color:var(--color-ink-500)] line-through' : undefined}>{g.name}</span>
                    <select
                      aria-label={`Seat ${g.name}`}
                      className="field min-h-0 w-32 shrink-0 py-1 text-xs"
                      value=""
                      onChange={(e) => run(() => assignTableAction(invitationId, g.id, e.target.value || null))}
                    >
                      <option value="">Seat at…</option>
                      {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-[color:var(--color-ink-500)]">Links look like {baseUrl.replace(slug, slug)}/… — each one is private to its guest. Do not post them in a group chat; use the general link for that.</p>
    </div>
  );
}
