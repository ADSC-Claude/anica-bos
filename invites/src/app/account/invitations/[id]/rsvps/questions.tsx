'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SectionData } from '@/lib/sections';
import { saveSectionAction } from '@/app/account/actions';
import { invitationPath } from '@/lib/app-url';
import { formatDate } from '@/lib/datetime';
import { TIER_LABELS } from '@/lib/tiers';
import { Notice } from '@/components/ui';
import { PhonePreview } from '@/components/account/phone';

/** How long after the last keystroke the date or the number is saved. */
export const SAVE_AFTER_MS = 500;

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** The switches, in the order the form asks them. Each names the stored field and whether the switch reads the field backwards. */
const SWITCHES: { field: string; label: string; hint: string; inverted?: true }[] = [
  { field: 'showSeats', label: 'Ask how many are coming', hint: 'A number beside their yes. On a personal link it stops at the seats you set aside for them.' },
  { field: 'collectAttendees', label: 'Ask who is coming with them', hint: 'The names of their companions, and what each one is to them.' },
  { field: 'askDietary', label: 'Ask about allergies and dietary notes', hint: 'A line for anything the kitchen should know.' },
  // Stored the other way round — the form's own toggle is "Skip the group
  // question" — because the question is asked unless the couple says not to.
  // A switch that reads "ask" is the one a customer expects to find on.
  { field: 'hideGroups', label: 'Ask which group they belong to', hint: 'Sponsors, family, friends — the groups you listed on the Invitation tab. Your headcount sheet is grouped by them.', inverted: true },
];

/**
 * What guests see: the RSVP questions on the left, the form on a phone on
 * the right.
 *
 * The two share one card because they are one thing — a switch turned on
 * here is a question on the phone a moment later, and the phone reloading is
 * what tells the customer the switch took. So this component holds the
 * whole rsvp section in state and the version counter the phone reloads on.
 *
 * Every change sends the whole section, never the one field: saveSection
 * cleans what it is given and blanks whatever is missing, so a partial save
 * would wipe the meal choices, the groups and the policy line along with
 * the fixed writings our team keeps on the same section. A switch saves at
 * once; the date and the number wait for the typing to stop. Neither has a
 * save button, the same as the Invitation tab.
 */
export function WhatGuestsSee({
  invitationId,
  slug,
  section: initial,
  window: changes,
  live,
  confirms,
  deadlineHint,
  phonePlaceholder,
}: {
  invitationId: string;
  slug: string;
  /** The whole rsvp section as stored, so a save can send all of it back. */
  section: SectionData;
  /** When changes close and when the final touches are due, or nothing for an event with no date. */
  window: { closesAt: string; finalAt: string; closed: boolean } | null;
  /** Published: the form belongs to our team now, the same as on the Invitation tab. */
  live: boolean;
  /** Whether each guest who accepts and leaves an address is written back to. */
  confirms: boolean;
  /** The deadline field's own hint, so the two tabs say the same thing about it. */
  deadlineHint: string;
  phonePlaceholder: string;
}) {
  const router = useRouter();
  const [section, setSection] = useState<SectionData>(initial);
  const latest = useRef<SectionData>(initial);
  const [state, setState] = useState<SaveState>('idle');
  const stateRef = useRef<SaveState>('idle');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // bumped after every save that landed, and the phone reloads on it
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  // a save asked for while one is in flight: it goes next
  const again = useRef(false);

  // Two things close the questions to a customer, the same two that close
  // the form: publishing, and the three-week window before the event.
  const closed = live || Boolean(changes?.closed);
  const when = (iso: string) => formatDate(new Date(iso));
  const on = (field: string) => section[field] === true;
  const text = (field: string) => (typeof section[field] === 'string' ? (section[field] as string) : '');

  const setSave = (s: SaveState) => {
    stateRef.current = s;
    setState(s);
  };

  /**
   * Send the newest value. A save already on its way is let land first.
   * `before` is what to go back to if this one fails — given for a switch,
   * so a question the form is not asking is never shown as on; not for the
   * typed fields, where taking the typing away would be the worse outcome.
   */
  async function flush(before?: SectionData) {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    setSave('saving');
    setError('');
    const sent = latest.current;
    const res = await saveSectionAction(invitationId, 'rsvp', sent);
    inflight.current = false;
    if (!res.ok) {
      setSave('error');
      setError(res.error);
      if (before && latest.current === sent) {
        latest.current = before;
        setSection(before);
      }
    } else {
      setNote(res.data.issues[0]?.message ?? '');
      if (latest.current === sent && !again.current) setSave('saved');
      setVersion((k) => k + 1);
      router.refresh();
    }
    if (again.current) {
      again.current = false;
      void flush();
    }
  }

  function change(field: string, value: unknown, at: 'once' | 'later') {
    const before = latest.current;
    const next = { ...before, [field]: value };
    latest.current = next;
    setSection(next);
    if (at === 'once') {
      void flush(before);
      return;
    }
    setSave('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
  }

  // The half-second between the last keystroke and the save: a tab closed in
  // it would lose the keystroke, so the browser asks first, and leaving for
  // another page inside the app sends the save on its way.
  useEffect(() => {
    const ask = (e: BeforeUnloadEvent) => {
      if (stateRef.current === 'dirty' || stateRef.current === 'saving') e.preventDefault();
    };
    window.addEventListener('beforeunload', ask);
    return () => {
      window.removeEventListener('beforeunload', ask);
      if (timer.current) {
        clearTimeout(timer.current);
        if (stateRef.current === 'dirty') void saveSectionAction(invitationId, 'rsvp', latest.current);
      }
    };
  }, [invitationId]);

  const formSrc = `${invitationPath(slug)}?bare=1&at=rsvp`;

  return (
    <section className="card grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">Your RSVP questions</h2>
        <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">Turn a question on and it is on the form at once.</p>

        <div className="mt-3 space-y-2">
          {live ? (
            <Notice tone="info">
              Your invitation is live, so this is how the form stands rather than something to change here.
              Anything that still needs changing is ours to do — message us on Messenger or Viber and we will sort it out.
            </Notice>
          ) : closed && changes ? (
            <Notice tone="warn">Changes closed on {when(changes.closesAt)}, three weeks before your event. Your invitation is with our team for the final touches, done by {when(changes.finalAt)}. Message us for anything urgent.</Notice>
          ) : null}
        </div>

        <fieldset disabled={closed} className="mt-3 min-w-0 border-0 p-0">
          <ul className="grid gap-3">
            {SWITCHES.map((s) => {
              const checked = s.inverted ? !on(s.field) : on(s.field);
              return (
                <li key={s.field}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={checked}
                      onChange={(e) => change(s.field, s.inverted ? !e.target.checked : e.target.checked, 'once')}
                    />
                    <span>
                      {s.label}
                      <span className="block text-xs text-[color:var(--color-ink-500)]">{s.hint}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="rsvp-deadline">Reply-by date</label>
              <input id="rsvp-deadline" type="date" className="field" value={text('deadline')} onChange={(e) => change('deadline', e.target.value, 'later')} />
              {deadlineHint && <p className="hint">{deadlineHint}</p>}
            </div>
            <div>
              <label className="label" htmlFor="rsvp-phone">RSVP by text</label>
              <input id="rsvp-phone" type="tel" className="field" value={text('contactPhone')} placeholder={phonePlaceholder} maxLength={30} autoComplete="off" onChange={(e) => change('contactPhone', e.target.value, 'later')} />
              <p className="hint">Shown under the form, for guests who would rather text than fill it in.</p>
            </div>
          </div>
        </fieldset>

        <p className="mt-4 text-xs text-[color:var(--color-ink-500)]">
          Meal choices and the wording are on the <Link href={`/account/invitations/${invitationId}?section=rsvp`} className="underline">Invitation tab</Link>.
        </p>

        {!closed && (
          <p className="mt-2 text-xs" aria-live="polite">
            {state === 'saving' || state === 'dirty' ? (
              <span className="text-[color:var(--color-ink-500)]">Saving…</span>
            ) : state === 'error' ? (
              <span role="alert" className="text-[color:var(--bad)]">Could not save: {error || 'something went wrong — try again.'}</span>
            ) : state === 'saved' ? (
              note ? <span className="text-[color:var(--warn)]">Saved, with a note: {note}</span> : <span className="text-[color:var(--ok)]">Saved</span>
            ) : (
              <span className="text-[color:var(--color-ink-500)]">Auto-save on</span>
            )}
          </p>
        )}
      </div>

      <div className="min-w-0 lg:w-[24rem]">
        <p className="mb-3 text-xs text-[color:var(--color-ink-500)]">
          This is the RSVP on your page, as your guests see it. After they send it they see a thank-you on the page
          {confirms
            ? ', and each guest who accepts and leaves an e-mail address gets a confirmation of their seats.'
            : ` — a confirmation e-mail to each guest who accepts comes with the ${TIER_LABELS.LUXURY} package.`}
        </p>
        <div className="builder-phone w-full">
          <PhonePreview src={formSrc} version={version} />
        </div>
        <p className="mt-2 text-center text-xs">
          <a href={formSrc} target="_blank" rel="noopener" className="underline">Open in a new tab</a>
        </p>
      </div>
    </section>
  );
}
