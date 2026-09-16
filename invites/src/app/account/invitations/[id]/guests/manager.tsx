'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Notice } from '@/components/ui';
import { importNotice, type ImportResult } from '@/lib/guest-dupes';
import { addGuestAction, updateGuestAction, deleteGuestAction, importGuestsAction, importGuestFileAction, assignTableAction } from '@/app/account/actions';

type Guest = { id: string; name: string; salutation: string; groupName: string; seatsAllotted: number; plusOneAllowed: boolean; phone: string; email: string; notes: string; token: string; tableId: string | null; checkedIn: boolean; response: { response: 'ACCEPT' | 'DECLINE'; seats: number } | null };
type Table = { id: string; name: string };

const FILE_TYPES = '.csv,.tsv,.txt,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * The list, in the order a customer works: the two ways to put a name on it,
 * both open all the time, then the names, then where the tables are. The
 * Tables and Seating plan cards that used to sit under the list are the
 * Seating chart tab now; what stays here is the Table column, because "which
 * table is Tita Baby at" is a question about a guest.
 */
export function GuestManager({ invitationId, baseUrl, reminder, canSeating, tables, guests }: { invitationId: string; baseUrl: string; reminder: string; canSeating: boolean; tables: Table[]; guests: Guest[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const [group, setGroup] = useState('');
  const [editing, setEditing] = useState<Guest | null>(null);
  // Counts the adds. The form's fields are uncontrolled, so the way to blank
  // it after a guest lands is to mount it again under a new key.
  const [added, setAdded] = useState(0);
  const [copied, setCopied] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const groups = useMemo(() => Array.from(new Set(guests.map((g) => g.groupName).filter(Boolean))).sort(), [guests]);
  const visible = guests.filter((g) => (!group || g.groupName === group) && (!filter || `${g.name} ${g.salutation} ${g.phone} ${g.email}`.toLowerCase().includes(filter.toLowerCase())));
  const columns = canSeating ? 7 : 6;

  // The form is at the top and the name that was clicked may be two hundred
  // rows down. Without this the click looks like it did nothing.
  useEffect(() => {
    if (editing) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editing]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, done?: (d: unknown) => void) =>
    start(async () => {
      setError('');
      setNotice('');
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Something went wrong.');
      else done?.(r.data);
    });
  const imported = (d: unknown) => setNotice(importNotice(d as ImportResult));

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
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          ref={formRef}
          key={editing ? editing.id : `new-${added}`}
          className="card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(
              () => (editing ? updateGuestAction(invitationId, editing.id, fd) : addGuestAction(invitationId, fd)),
              () => (editing ? setEditing(null) : setAdded((n) => n + 1)),
            );
          }}
        >
          <h2 className="font-semibold">{editing ? 'Edit guest' : 'Add a guest'}</h2>
          <p className="mb-3 text-sm text-[color:var(--color-ink-500)]">A name is all we need. A mobile number or e-mail lets you send them their link and a reminder. Seats is how many places you are holding for them — a couple is 2.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2"><label className="label">Name <span className="font-normal text-[color:var(--color-ink-500)]">(required)</span></label><input name="name" className="field" defaultValue={editing?.name ?? ''} required /></div>
            <div><label className="label">Seats reserved</label><input name="seatsAllotted" type="number" min={1} max={20} className="field" defaultValue={editing?.seatsAllotted ?? 1} /></div>
            <div><label className="label">Greeting <span className="font-normal text-[color:var(--color-ink-500)]">(“Dear …”)</span></label><input name="salutation" className="field" defaultValue={editing?.salutation ?? ''} placeholder="Mr. & Mrs. Dela Cruz" /></div>
            <div><label className="label">Group</label><input name="groupName" className="field" defaultValue={editing?.groupName ?? group} list="groups" placeholder="Bride's family" /><datalist id="groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></div>
            <div><label className="label">Mobile</label><input name="phone" className="field" defaultValue={editing?.phone ?? ''} inputMode="tel" /></div>
            <div><label className="label">Email</label><input name="email" className="field" defaultValue={editing?.email ?? ''} type="email" /></div>
            {canSeating && (
              <div><label className="label">Table</label><select name="tableId" className="field" defaultValue={editing?.tableId ?? ''}><option value="">— none —</option>{tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            )}
            <div className="sm:col-span-3"><label className="label">Notes <span className="font-normal text-[color:var(--color-ink-500)]">(for you only — guests never see this)</span></label><input name="notes" className="field" defaultValue={editing?.notes ?? ''} /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="plusOneAllowed" defaultChecked={editing?.plusOneAllowed ?? false} className="h-4 w-4" /> Allow a plus-one beyond the reserved seats</label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {editing ? (
              <>
                <button type="submit" className="btn btn-primary" disabled={pending}>Save</button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                <button type="button" className="btn btn-ghost text-[color:var(--bad)]" onClick={() => { if (confirm('Remove this guest?')) run(() => deleteGuestAction(invitationId, editing.id), () => setEditing(null)); }}>Remove</button>
              </>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={pending}>+ Add guest</button>
            )}
          </div>
        </form>

        <div className="card p-4">
          <h2 className="font-semibold">Import your list</h2>
          <p className="mb-3 text-sm text-[color:var(--color-ink-500)]">Bring the list you already keep. Columns: Name, Group, Seats, Mobile, Email — a header row is fine, Greeting is optional. Download the blank list, fill it in with Excel or Google Sheets, and upload it back — the workbook is read as it is, no need to save as CSV.</p>
          {/* Two files, one question each: have you got a list yet, or are you
              fixing the one you have? Offering only the blank was what made a
              second upload mean a second copy of everybody. */}
          <div className="grid gap-2 sm:grid-cols-2">
            <a href={`/account/invitations/${invitationId}/guest-template.csv`} className="rounded-xl border border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50,#fbf8f3)] p-3 no-underline hover:bg-[color:var(--color-sand-100)]">
              <b className="block text-sm">Blank list ↓</b>
              <span className="text-xs text-[color:var(--color-ink-500)]">Starting from nothing. Name, group, seats, mobile, email, greeting — with an example of each.</span>
            </a>
            <a href={`/account/invitations/${invitationId}/seat-sheet.csv`} className="rounded-xl border border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50,#fbf8f3)] p-3 no-underline hover:bg-[color:var(--color-sand-100)]">
              <b className="block text-sm">Seat sheet ↓</b>
              <span className="text-xs text-[color:var(--color-ink-500)]">The {guests.length} {guests.length === 1 ? 'guest' : 'guests'} you already have, with a Seats column to settle. Send it back and it updates them — it does not add them again.</span>
            </a>
          </div>
          <label className="label mt-4" htmlFor="guest-file">Upload the file</label>
          <input
            id="guest-file"
            type="file"
            accept={FILE_TYPES}
            className="field text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const form = new FormData();
              form.set('file', file);
              e.target.value = '';
              run(() => importGuestFileAction(invitationId, form), imported);
            }}
          />
          <p className="hint">Excel (.xlsx) or CSV. <b>The instructions are inside the file.</b> A name, mobile or e-mail already on the list is skipped, and a row that keeps its personal link is read as an edit — so sending the same file twice is safe either way.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const text = String(new FormData(form).get('text') ?? '');
              if (!text.trim()) return;
              run(() => importGuestsAction(invitationId, text), (d) => { imported(d); form.reset(); });
            }}
          >
            <label className="label mt-4" htmlFor="guest-rows">Or paste the rows</label>
            <textarea id="guest-rows" name="text" className="field font-mono text-xs" rows={4} placeholder={'Name\tGroup\tSeats\tMobile\tEmail\nMr. & Mrs. Dela Cruz\tBride\'s family\t2\t0917 123 4567\tdelacruz@email.com'} />
            <button type="submit" className="btn btn-secondary btn-sm mt-2" disabled={pending}>Import pasted rows</button>
          </form>
        </div>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}
      {notice && <Notice tone="ok">{notice}</Notice>}
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <input className="field max-w-xs" placeholder="Search guests" aria-label="Search guests" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select className="field max-w-[12rem]" aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All groups</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          {(filter || group) && <span className="text-sm text-[color:var(--color-ink-500)]">{visible.length} of {guests.length}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="data">
            <thead><tr><th>Guest</th><th>Group</th><th>Seats</th><th>Response</th>{canSeating && <th>Table</th>}<th>Personal link</th><th /></tr></thead>
            <tbody>
              {guests.length === 0 && <tr><td colSpan={columns} className="text-center text-[color:var(--color-ink-500)]">No guests yet. Add one above or import your list — each name gets its own link the moment it is here.</td></tr>}
              {guests.length > 0 && visible.length === 0 && <tr><td colSpan={columns} className="text-center text-[color:var(--color-ink-500)]">Nobody on the list matches that.</td></tr>}
              {visible.map((g) => (
                <tr key={g.id}>
                  <td><button type="button" className="text-left font-medium underline-offset-2 hover:underline" onClick={() => setEditing(g)}>{g.name}</button>{g.salutation && <span className="block text-xs text-[color:var(--color-ink-500)]">Dear {g.salutation}</span>}{(g.phone || g.email) && <span className="block text-xs text-[color:var(--color-ink-500)]">{[g.phone, g.email].filter(Boolean).join(' · ')}</span>}</td>
                  <td>{g.groupName}</td>
                  <td>{g.seatsAllotted}{g.plusOneAllowed ? ' +1' : ''}</td>
                  <td>{g.response ? <span className={`pill ${g.response.response === 'ACCEPT' ? 'pill-ok' : 'pill-bad'}`}>{g.response.response === 'ACCEPT' ? `Yes · ${g.response.seats}` : 'No'}</span> : <span className="pill pill-muted">Waiting</span>}{g.checkedIn && <span className="pill pill-info ml-1">In</span>}</td>
                  {canSeating && (
                    <td>
                      <select className="field min-h-0 py-1 text-xs" aria-label={`Table for ${g.name}`} value={g.tableId ?? ''} onChange={(e) => run(() => assignTableAction(invitationId, g.id, e.target.value || null))}>
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
      </div>

      {canSeating && (
        <p className="text-sm text-[color:var(--color-ink-500)]">
          Lay out the tables and drag names to seats on the <Link href={`/account/invitations/${invitationId}/seating`} className="underline">Seating chart</Link> tab.
        </p>
      )}
      <p className="text-xs text-[color:var(--color-ink-500)]">Links look like {baseUrl}/… — each one is private to its guest. Do not post them in a group chat; use the general link for that.</p>
    </div>
  );
}
