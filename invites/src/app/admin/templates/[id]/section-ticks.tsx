'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Occasion } from '@prisma/client';
import { OCCASION_SECTIONS, sectionLabel } from '@/lib/sections';
import { OCCASIONS } from '@/lib/occasions';

/**
 * The parts a design renders, following the occasion as it is picked.
 *
 * The list was drawn on the server for the occasion the page opened with,
 * and changing the occasion above it changed nothing until a save — the
 * hint said so. So a christening chosen on a new design was ticked as a
 * wedding: the ninongs and ninangs and the baby's photographs were never
 * on the form, never ticked, and never became pages. Now the list is the
 * chosen occasion's, the moment it is chosen: each occasion's own parts,
 * named the way that occasion names them, every one ticked to begin
 * with, and a tick taken off stays off if the part is still there on the
 * next occasion. The names posted are the same the save always read.
 */
export function SectionTicks({ occasion: initial, ticked }: { occasion: Occasion; ticked: string[] | null }) {
  const [occasion, setOccasion] = useState<Occasion>(initial);
  // what she has taken off; a design's saved ticks are its starting point
  const [off, setOff] = useState<Set<string>>(() => new Set(ticked ? OCCASION_SECTIONS[initial].filter((k) => !ticked.includes(k)) : []));

  useEffect(() => {
    const form = document.getElementById('template-form');
    const select = form instanceof HTMLFormElement ? form.elements.namedItem('occasion') : null;
    if (!(select instanceof HTMLSelectElement)) return;
    const follow = () => { if (select.value in OCCASION_SECTIONS) setOccasion(select.value as Occasion); };
    follow();
    select.addEventListener('change', follow);
    return () => select.removeEventListener('change', follow);
  }, []);

  const keys = OCCASION_SECTIONS[occasion];
  const name = useMemo(() => OCCASIONS.find((o) => o.key === occasion)?.label ?? occasion, [occasion]);
  return (
    <div data-testid="section-ticks" data-occasion={occasion}>
      <p className="label">Sections this layout renders</p>
      <p className="hint mb-1">The parts of a {name}, as picked above. Each ticked part starts as a page of a new design.</p>
      <div className="grid grid-cols-2 gap-1 text-sm">
        {keys.map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input
              type="checkbox"
              name={`section_${k}`}
              checked={!off.has(k)}
              onChange={(e) => setOff((was) => { const next = new Set(was); if (e.target.checked) next.delete(k); else next.add(k); return next; })}
              className="h-4 w-4"
            />
            {sectionLabel(k, occasion)}
          </label>
        ))}
      </div>
      <p className="hint">Unticked sections are hidden on this design but the customer&apos;s data is kept. A design drawn in the studio says this in its pages instead.</p>
    </div>
  );
}
