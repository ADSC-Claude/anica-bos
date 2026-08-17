'use client';

import { useState } from 'react';

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: string;
};
export type MenuCategory = { id: string; name: string; services: MenuItem[] };

/**
 * The price list, set as a printed spa menu: leader dots from the treatment to
 * its price, categories in the order the catalogue puts them.
 *
 * The categories run down one column rather than two. In two columns the eye
 * goes Massage, then Body Treatments across, then Other Services below — so
 * the order you read is not the order the tabs are in, and picking a tab looks
 * like it has shuffled the list. One column means one sequence.
 */
export function PriceMenu({ categories }: { categories: MenuCategory[] }) {
  const [active, setActive] = useState('all');
  const tabs = [{ id: 'all', name: 'All' }, ...categories];

  return (
    <>
      <div role="tablist" aria-label="Service categories" className="flex flex-wrap justify-center gap-2">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.id)}
              className={`min-h-9 border px-4 py-2 text-[11px] uppercase tracking-[0.15em] transition ${
                on
                  ? 'border-cocoa-800 bg-cocoa-800 text-white'
                  : 'border-sand-200 text-cocoa-500 hover:border-sand-300 hover:text-cocoa-800'
              }`}
            >
              {t.name}
            </button>
          );
        })}
      </div>

      <div className="mx-auto mt-12 max-w-2xl space-y-14">
        {categories
          .filter((cat) => active === 'all' || cat.id === active)
          .map((cat) => (
            <div key={cat.id}>
              <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-gilt-600">
                {cat.name}
              </h3>
              <span aria-hidden className="mx-auto mt-4 block h-px w-12 bg-sand-300" />

              <ul className="mt-7 space-y-5">
                {cat.services.map((s) => (
                  <li key={s.id}>
                    <div className="flex items-baseline gap-3">
                      <span className="font-medium text-cocoa-800">{s.name}</span>
                      <span
                        aria-hidden
                        className="min-w-6 flex-1 -translate-y-1 border-b border-dotted border-sand-300"
                      />
                      {/* Most catalogues already carry the length in the name
                          — "Swedish Massage (60 min)" — so the column is only
                          filled when the name has not said it already. */}
                      {!/\d\s*min/i.test(s.name) && (
                        <span className="num shrink-0 text-xs text-cocoa-500">
                          {s.durationMinutes} min
                        </span>
                      )}
                      <span className="num shrink-0 text-[15px] text-gilt-600">{s.price}</span>
                    </div>
                    {s.description && (
                      <p className="mt-1 text-sm text-cocoa-500">{s.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </>
  );
}
