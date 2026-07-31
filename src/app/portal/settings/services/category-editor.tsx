'use client';

import { useActionState, useState } from 'react';
import { saveServiceCategoryAction, type FormState } from '../actions';

type Category = { id: string; name: string; sortRank: number; active: boolean };

export function ServiceCategoryEditor({ categories }: { categories: Category[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveServiceCategoryAction, {});
  const [selectedId, setSelectedId] = useState('');
  const current = categories.find((c) => c.id === selectedId);
  // A new category goes to the bottom by default rather than colliding with
  // whatever already sits at that rank.
  const nextRank = categories.reduce((max, c) => Math.max(max, c.sortRank), 0) + 1;

  return (
    <div className="card-pad space-y-4">
      <label className="block">
        <span className="label">Edit a category</span>
        <select className="select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">— create a new category —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      <form action={action} className="space-y-3" key={selectedId}>
        <input type="hidden" name="id" value={selectedId} />
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <label className="block">
            <span className="label">Name *</span>
            <input name="name" className="input" defaultValue={current?.name} required
              placeholder="e.g. Facials" />
          </label>
          <label className="block">
            <span className="label">Order</span>
            <input name="sortRank" type="number" className="input"
              defaultValue={current?.sortRank ?? nextRank} />
          </label>
        </div>
        <span className="block text-[11px] text-cocoa-400">
          Lowest order first, on the price list and the booking form alike. Categories sharing a
          number fall back to alphabetical order.
        </span>

        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="active" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.active ?? true} />
          Show on the public price list and booking form
        </label>
        <span className="block text-[11px] text-cocoa-400">
          Turning this off hides the heading from clients. Its services stay bookable in the
          portal and sellable at the POS.
        </span>

        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-cocoa-600">{state.ok}</p>}
        <button className="btn-primary w-full" type="submit">
          {selectedId ? 'Save category' : 'Add category'}
        </button>
      </form>
    </div>
  );
}
