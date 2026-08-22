'use client';

import { useActionState, useState } from 'react';
import { savePackageAction, type FormState } from '../actions';

type Pkg = {
  id: string; name: string; type: string; description: string;
  price: number; validityDays: number; memberDiscountPercent: number;
  birthdayPerkServiceId: string; active: boolean; showOnLanding: boolean;
  items: { serviceId: string; sessions: number }[];
  imageUrl: string;
};

let seq = 0;

export function PackageForm({
  packages,
  services,
}: {
  packages: Pkg[];
  services: { id: string; name: string; priceCents: number }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(savePackageAction, {});
  const [selectedId, setSelectedId] = useState('');
  const current = packages.find((p) => p.id === selectedId);
  const [type, setType] = useState(current?.type ?? 'SESSION_PACKAGE');
  const [lines, setLines] = useState<{ key: string; serviceId: string; sessions: string }[]>(
    current?.items.map((i) => ({ key: `i${++seq}`, serviceId: i.serviceId, sessions: String(i.sessions) })) ?? [
      { key: `i${++seq}`, serviceId: '', sessions: '1' },
    ],
  );

  function selectPackage(id: string) {
    setSelectedId(id);
    const p = packages.find((x) => x.id === id);
    setType(p?.type ?? 'SESSION_PACKAGE');
    setLines(
      p?.items.length
        ? p.items.map((i) => ({ key: `i${++seq}`, serviceId: i.serviceId, sessions: String(i.sessions) }))
        : [{ key: `i${++seq}`, serviceId: '', sessions: '1' }],
    );
  }

  return (
    <div className="card-pad space-y-4">
      <label className="block">
        <span className="label">Edit an existing package</span>
        <select className="select" value={selectedId} onChange={(e) => selectPackage(e.target.value)}>
          <option value="">— create a new package —</option>
          {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      <form action={action} className="space-y-3" key={selectedId}>
        <input type="hidden" name="id" value={selectedId} />
        <label className="block">
          <span className="label">Name *</span>
          <input name="name" className="input" defaultValue={current?.name} required />
        </label>
        <label className="block">
          <span className="label">Photo of the card</span>
          <input name="imageUrl" className="input" defaultValue={current?.imageUrl ?? ''}
            placeholder="/gold-card.jpg" />
          <span className="mt-1 block text-[11px] text-cocoa-400">
            Shown on the landing page above this package. A photograph of the card itself sells
            a membership better than its perks list does. Upload to the repository&apos;s{' '}
            <code>public</code> folder and enter the file name, <code>/gold-card.jpg</code> —
            the folder itself is not part of the address, and the name must match its capitals.
            Or paste a full https:// link. Landscape suits the frame.
          </span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Type</span>
            <select name="type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="SESSION_PACKAGE">Prepaid session package</option>
              <option value="MEMBERSHIP">Membership</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Price (₱) *</span>
            <input name="price" type="number" step="0.01" min={0} className="input"
              defaultValue={current?.price ?? 0} required />
          </label>
        </div>
        <label className="block">
          <span className="label">Description</span>
          <textarea name="description" className="textarea" rows={4} defaultValue={current?.description} />
          <span className="mt-1 block text-[11px] text-cocoa-400">
            One perk per line — each line becomes its own bullet on the price list. A single
            line stays a sentence.
          </span>
        </label>
        <label className="block">
          <span className="label">Validity (days)</span>
          <input name="validityDays" type="number" min={1} className="input"
            defaultValue={current?.validityDays ?? 365} />
          <span className="mt-1 block text-[11px] text-cocoa-400">
            Memberships are 1 year (365 days) by default.
          </span>
        </label>

        {type === 'MEMBERSHIP' ? (
          <>
            <label className="block">
              <span className="label">Member discount (%)</span>
              <input name="memberDiscountPercent" type="number" min={0} max={100} className="input"
                defaultValue={current?.memberDiscountPercent ?? 10} />
            </label>
            <label className="block">
              <span className="label">Free birthday-month service</span>
              <select name="birthdayPerkServiceId" className="select"
                defaultValue={current?.birthdayPerkServiceId ?? ''}>
                <option value="">— no birthday perk —</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <span className="mt-1 block text-[11px] text-cocoa-400">
                POS flags it automatically during the member&apos;s birthday month, once per
                membership year. Commission is still credited on the base price.
              </span>
            </label>
          </>
        ) : (
          <fieldset className="space-y-2">
            <legend className="label">Sessions included</legend>
            {lines.map((l, i) => (
              <div key={l.key} className="flex gap-1.5">
                <select name="itemServiceId" className="select flex-1" value={l.serviceId}
                  onChange={(e) => setLines((p) => p.map((x, xi) => xi === i ? { ...x, serviceId: e.target.value } : x))}>
                  <option value="">Choose a service…</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input name="itemSessions" type="number" min={1} className="input w-20" value={l.sessions}
                  onChange={(e) => setLines((p) => p.map((x, xi) => xi === i ? { ...x, sessions: e.target.value } : x))} />
                {lines.length > 1 && (
                  <button type="button" className="btn-ghost btn-sm text-clay-500"
                    onClick={() => setLines((p) => p.filter((_, xi) => xi !== i))}>×</button>
                )}
              </div>
            ))}
            <button type="button" className="btn-secondary btn-sm w-full"
              onClick={() => setLines((p) => [...p, { key: `i${++seq}`, serviceId: '', sessions: '1' }])}>
              + Add service
            </button>
          </fieldset>
        )}

        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="active" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.active ?? true} />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="showOnLanding" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.showOnLanding ?? false} />
          Show on the public landing page
        </label>

        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-cocoa-600">{state.ok}</p>}
        <button className="btn-primary w-full" type="submit">
          {selectedId ? 'Save package' : 'Create package'}
        </button>
      </form>
    </div>
  );
}
