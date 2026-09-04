'use client';

import { useMemo, useState, useTransition } from 'react';
import { addGuestAction, updateGuestAction, deleteGuestAction, importGuestsAction, saveTableAction, deleteTableAction, assignTableAction } from '@/app/account/actions';

type Guest = { id: string; name: string; salutation: string; groupName: string; seatsAllotted: number; plusOneAllowed: boolean; phone: string; email: string; notes: string; token: string; tableId: string | null; checkedIn: boolean; response: { response: 'ACCEPT' | 'DECLINE'; seats: number } | null };
type Table = { id: string; name: string; capacity: number; seated: number };

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
  const visible = guests.filter((g) => (!group || g.groupName === group) && (!filter || `${g.name} ${g.salutation} ${g.phone}`.toLowerCase().includes(filter.toLowerCase())));

  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, done?: (d: unknown) => void) =>
    start(async () => {
      setError('');
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Something went wrong.');
      else done?.(r.data);
    });

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
        <form className="card p-4" onSubmit={(e) => { e.preventDefault(); const text = String(new FormData(e.currentTarget).get('text') ?? ''); run(() => importGuestsAction(invitationId, text), (d) => { const r = d as { added: number; skipped: number }; setNotice(`Imported ${r.added} guest${r.added === 1 ? '' : 's'}${r.skipped ? `, skipped ${r.skipped} blank rows` : ''}.`); setShowImport(false); }); }}>
          <p className="text-sm">Paste rows from Excel or Google Sheets. Columns: <b>Name, Group, Seats, Phone</b> (a header row is fine; <i>Salutation</i> is optional).</p>
          <textarea name="text" className="field mt-2 font-mono text-xs" rows={6} placeholder={'Name\tGroup\tSeats\tPhone\nMr. & Mrs. Dela Cruz\tBride\'s family\t2\t0917…'} required />
          <button type="submit" className="btn btn-primary mt-2" disabled={pending}>Import</button>
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
                <td><button type="button" className="text-left font-medium underline-offset-2 hover:underline" onClick={() => setEditing(g)}>{g.name}</button>{g.salutation && <span className="block text-xs text-[color:var(--color-ink-500)]">Dear {g.salutation}</span>}{g.phone && <span className="block text-xs text-[color:var(--color-ink-500)]">{g.phone}</span>}</td>
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
          <h2 className="mb-2 font-semibold">Tables</h2>
          <div className="flex flex-wrap gap-2">
            {tables.map((t) => (
              <form key={t.id} className="flex items-center gap-1 rounded-xl border border-[color:var(--color-sand-200)] p-2 text-sm" onSubmit={(e) => { e.preventDefault(); run(() => saveTableAction(invitationId, new FormData(e.currentTarget))); }}>
                <input type="hidden" name="id" value={t.id} />
                <input name="name" defaultValue={t.name} className="field min-h-0 w-28 py-1 text-sm" />
                <input name="capacity" type="number" defaultValue={t.capacity} className="field min-h-0 w-16 py-1 text-sm" />
                <span className={`text-xs ${t.seated > t.capacity ? 'text-[color:var(--bad)]' : 'text-[color:var(--color-ink-500)]'}`}>{t.seated}/{t.capacity}</span>
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
      <p className="text-xs text-[color:var(--color-ink-500)]">Links look like {baseUrl.replace(slug, slug)}/… — each one is private to its guest. Do not post them in a group chat; use the general link for that.</p>
    </div>
  );
}
