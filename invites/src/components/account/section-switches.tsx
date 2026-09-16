'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveSectionAction } from '@/app/account/actions';
import type { SectionKey } from '@/lib/sections';
import { Notice } from '@/components/ui';

export type SectionSwitch = {
  /** The toggle field in the section this switch writes. */
  field: string;
  label: string;
  /** What is true of the page while the switch is on, and while it is off. */
  on: string;
  off: string;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * A tool's own switches, on the tab where the tool lives: the guestbook is
 * turned on from the Guestbook tab and the album from Guest photos, and each
 * switch says in a sentence what its setting means for the page right now.
 *
 * Every save carries the whole section. saveSectionAction cleans what it is
 * sent into the section's full shape, so a partial object would blank every
 * field it left out — the other switch, the prompt our team wrote. The
 * newest copy lives in a ref and each flip merges into it, so two quick
 * flips never send a stale one; the saves then go out one after another,
 * each with the copy of its moment, so the second cannot land before the
 * first and be undone by it. A flip shows at once and is put back if the
 * save is refused, with the reason beside it.
 */
export function SectionSwitches({
  invitationId,
  section,
  data,
  switches,
  disabled,
}: {
  invitationId: string;
  section: SectionKey;
  /** The section as stored, whole — the staff-only fields included. */
  data: Record<string, unknown>;
  switches: SectionSwitch[];
  /** Why nothing can be saved right now. Every switch is disabled and this is shown as the reason. */
  disabled?: string;
}) {
  const router = useRouter();
  const latest = useRef(data);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const inflight = useRef(0);
  const [state, setState] = useState(data);
  const [save, setSave] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [, start] = useTransition();

  const put = (next: Record<string, unknown>) => {
    latest.current = next;
    setState(next);
  };

  function flip(field: string, value: boolean) {
    put({ ...latest.current, [field]: value });
    inflight.current += 1;
    setSave('saving');
    start(async () => {
      queue.current = queue.current.then(async () => {
        const res = await saveSectionAction(invitationId, section, latest.current).catch(() => ({ ok: false as const, error: 'Something went wrong — try again.' }));
        inflight.current -= 1;
        if (!res.ok) {
          put({ ...latest.current, [field]: !value });
          setError(res.error);
          setSave('error');
          return;
        }
        if (inflight.current === 0) setSave('saved');
        // the page's subtitle and counters read the section too
        router.refresh();
      });
      await queue.current;
    });
  }

  return (
    <div className="space-y-3">
      {disabled && <Notice tone="warn">{disabled}</Notice>}
      <ul className="space-y-3">
        {switches.map((sw) => {
          const on = state[sw.field] === true;
          return (
            <li key={sw.field}>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={on} disabled={Boolean(disabled)} onChange={(e) => flip(sw.field, e.target.checked)} />
                <span>
                  {sw.label}
                  <span className="block text-xs text-[color:var(--color-ink-500)]">{on ? sw.on : sw.off}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {!disabled && (
        <p className="text-xs" aria-live="polite">
          {save === 'saving' ? (
            <span className="text-[color:var(--color-ink-500)]">Saving…</span>
          ) : save === 'saved' ? (
            <span className="text-[color:var(--ok)]">Saved</span>
          ) : save === 'error' ? (
            <span role="alert" className="text-[color:var(--bad)]">Could not save: {error}</span>
          ) : (
            <span className="text-[color:var(--color-ink-500)]">Each switch saves as you flip it.</span>
          )}
        </p>
      )}
    </div>
  );
}
