'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

/**
 * Show me around: eight stops, one control each, a sentence or two on what
 * it does. The stop is lit by a ring whose shadow dims everything else, and
 * the card sits under it (or over it, near the foot of the screen). Nothing
 * is installed for it: the page marks its own landmarks with `data-tour`
 * and the tour finds them by name, so a landmark that is not on this page
 * (a locked tab, a phone that is a sheet on a small screen) is skipped.
 */
export type TourStep = { target: string; title: string; body: string };

type Box = { top: number; left: number; width: number; height: number };

export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = steps[i];

  useLayoutEffect(() => {
    const el = step && document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el || el.offsetParent === null) {
      // not on this page: move on, or finish
      if (i < steps.length - 1) setI(i + 1);
      else onClose();
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const place = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
    };
    const t = setTimeout(place, 350);
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [i, step, steps.length, onClose]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && i < steps.length - 1) setI(i + 1);
      if (e.key === 'ArrowLeft' && i > 0) setI(i - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [i, steps.length, onClose]);

  if (!step || !box) return null;
  const below = box.top + box.height + 200 < window.innerHeight;
  const cardTop = below ? box.top + box.height + 12 : Math.max(12, box.top - 12 - 170);
  const cardLeft = Math.min(Math.max(12, box.left), Math.max(12, window.innerWidth - 22 * 16 - 12));
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Show me around">
      <button type="button" aria-label="Close the tour" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="pointer-events-none absolute rounded-xl ring-2 ring-white transition-all duration-300" style={{ top: box.top, left: box.left, width: box.width, height: box.height, boxShadow: '0 0 0 9999px rgba(31, 29, 26, 0.55)' }} />
      <div className="absolute w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-xl bg-white p-4 shadow-2xl transition-all duration-300" style={{ top: cardTop, left: cardLeft }}>
        <p className="eyebrow">{i + 1} of {steps.length}</p>
        <p className="mt-1 font-semibold">{step.title}</p>
        <p className="mt-1 text-sm text-[color:var(--color-ink-700)]">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Skip</button>
          <div className="flex gap-2">
            {i > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setI(i - 1)}>Back</button>}
            {i < steps.length - 1 ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setI(i + 1)}>Next</button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Finish</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The stops on the Invitation tab, in the order a customer meets them. */
export const INVITATION_TOUR: TourStep[] = [
  { target: 'tabs', title: 'One tab per tool', body: 'Invitation is where you fill in. Share is your link and QR. The rest — guests, replies, check-in, messages — run once your guests have the link.' },
  { target: 'steps', title: 'The parts of your invitation', body: 'In the order they appear on your page. Work down the list; each one is one screen of your invitation.' },
  { target: 'form', title: 'Fill in the boxes', body: 'The line under each box says where the words land. Where there is an example, tap it and edit it — it is a place to start, not words in your mouth.' },
  { target: 'saving', title: 'Everything saves by itself', body: 'There is no save button to forget. This line says Saved once it has, and tells you if something needs a second look.' },
  { target: 'phone', title: 'Your page, as a guest sees it', body: 'A real phone, showing your real page. It catches up a moment after you type, at the part you are working on.' },
  { target: 'done', title: 'Mark a part done', body: 'When a part is finished — or when you are leaving it out on purpose. Once every part is marked done, our team knows your form is complete.' },
  { target: 'publish', title: 'Publish when it looks right', body: 'Until then only you can see it. Publishing gives you your link and your QR code, on the Share tab.' },
  { target: 'guide', title: 'Stuck?', body: 'The Guide has a chapter for every tab, in plain words, and the answers to the questions we are asked most.' },
];
