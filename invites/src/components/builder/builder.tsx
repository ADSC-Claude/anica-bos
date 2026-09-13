'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Tier } from '@prisma/client';
import type { Field, SectionData, SectionKey } from '@/lib/sections';
import type { Lang } from '@/lib/copy';
import type { ChecklistLine } from '@/lib/checklist';
import { TIER_LABELS } from '@/lib/tiers';
import { SectionFields } from './fields';
import { saveSectionAction, sectionDoneAction, languageAction, themeAction } from '@/app/account/actions';
import { invitationPath } from '@/lib/app-url';
import { formatDate } from '@/lib/datetime';
import { Notice } from '@/components/ui';
import { GetStarted, type SendToUs } from '@/components/account/checklist';

export type BuilderSection = { key: SectionKey; label: string; description: string; unlocked: boolean; filled: boolean; minTier: Tier };

/** How long after the last keystroke the section is saved. */
export const SAVE_AFTER_MS = 700;

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * The Invitation tab: the form on the left, the page on the right.
 *
 * Everything saves by itself. A change waits SAVE_AFTER_MS for the next
 * one, then goes; a save that lands while another is still in flight is
 * queued behind it, and the value that goes is always the newest, so
 * nothing typed is ever overtaken by an older save. The phone reloads
 * once each save has landed — at the part being edited, without the
 * opening — so the customer sees their words on the page a moment after
 * they type them. "Done" is no longer a way of saving: it is a tick that
 * says a part is finished, or left empty on purpose.
 */
export function Builder({
  invitationId,
  slug,
  status,
  sections,
  current,
  fields,
  initial,
  lang,
  listLimits,
  listHints,
  lookKey,
  allLooks,
  tier,
  looks,
  done: doneInitial,
  completedAt,
  window: changes,
  hidesWhenEmpty = false,
  checklist,
  send,
}: {
  invitationId: string;
  /** The parts the couple has marked done, when the form was completed, and when changes close. */
  done: SectionKey[];
  completedAt: string | null;
  window: { closesAt: string; finalAt: string; closed: boolean } | null;
  /** True where leaving this part empty means it simply does not appear on the invitation. */
  hidesWhenEmpty?: boolean;
  slug: string;
  status: string;
  /** The look the page is set in ('' for the design's own) and the looks to choose from. */
  lookKey: string;
  allLooks: number;
  tier: Tier;
  looks: { key: string; name: string; tagline: string }[];
  sections: BuilderSection[];
  current: SectionKey;
  fields: Field[];
  initial: SectionData;
  lang: Lang;
  listLimits: Record<string, number>;
  /** a list's hint from the design, e.g. a photo page with a fixed number of frames */
  listHints?: Record<string, string>;
  checklist: ChecklistLine[];
  /** The other ways of handing us the details, where the package has us typing them in. */
  send: SendToUs | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<SectionData>(initial);
  const latest = useRef<SectionData>(initial);
  const [state, setState] = useState<SaveState>('idle');
  const stateRef = useRef<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState('');
  // bumped after every save that landed, and the phone reloads on it
  const [version, setVersion] = useState(0);
  const [done, setDone] = useState<SectionKey[]>(doneInitial);
  const [sheet, setSheet] = useState(false);
  // The opening (the envelope, the clip) plays on the phone only when asked
  // for: it is the guest's first moment, and worth a look, but a form that
  // replayed it after every save would be a form nobody could work beside.
  const [opening, setOpening] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  // a save asked for while one is in flight: it goes next, with any Done mark it carried
  const again = useRef<{ done?: boolean } | null>(null);

  const total = sections.filter((s) => s.unlocked).length;
  const doneCount = sections.filter((s) => s.unlocked && done.includes(s.key)).length;
  const index = sections.findIndex((s) => s.key === current);
  const stepNo = sections.slice(0, index + 1).filter((s) => s.unlocked).length;
  const next = sections.slice(index + 1).find((s) => s.unlocked);
  const section = sections[index];
  const isDone = done.includes(current);
  // Two things close the form to a customer: publishing (revisions happen
  // before it, so there is nothing left to spend) and the three-week window.
  const live = status === 'PUBLISHED';
  const closed = live || Boolean(changes?.closed);
  const allDone = total > 0 && doneCount >= total;
  const when = (iso: string) => formatDate(new Date(iso));
  const labelOf = (path: string) => fields.find((f) => f.key === path.split(/[.[]/)[0])?.label ?? path;

  const setSave = (s: SaveState) => {
    stateRef.current = s;
    setState(s);
  };

  /** Send the newest value. A save already on its way is let land first; this one goes right after. */
  async function flush(opts: { done?: boolean } = {}) {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current) {
      again.current = { ...(again.current ?? {}), ...opts };
      return;
    }
    inflight.current = true;
    setSave('saving');
    setError('');
    const v = latest.current;
    const res = await saveSectionAction(invitationId, current, v, opts);
    inflight.current = false;
    if (!res.ok) {
      setSave('error');
      setError(res.error);
    } else {
      setDone(res.data.done);
      setNotes(res.data.issues.map((i) => `${labelOf(i.path)} — ${i.message}`));
      setSavedAt(new Date());
      if (latest.current === v && !again.current) setSave('saved');
      setVersion((k) => k + 1);
      router.refresh();
    }
    if (again.current) {
      const queued = again.current;
      again.current = null;
      void flush(queued);
    }
  }

  function change(nextValue: SectionData) {
    setValue(nextValue);
    latest.current = nextValue;
    setSave('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
  }

  // The half-second between the last keystroke and the save: leaving the
  // page in it would lose the keystroke, so the browser asks first — and a
  // step taken to the next part inside the app sends the save on its way.
  useEffect(() => {
    const ask = (e: BeforeUnloadEvent) => {
      if (stateRef.current === 'dirty' || stateRef.current === 'saving') e.preventDefault();
    };
    window.addEventListener('beforeunload', ask);
    return () => {
      window.removeEventListener('beforeunload', ask);
      if (timer.current) {
        clearTimeout(timer.current);
        if (stateRef.current === 'dirty') void saveSectionAction(invitationId, current, latest.current);
      }
    };
  }, [invitationId, current]);

  /** The tick: finished, or left out on purpose. Saves what is typed on the way. */
  function markDone(is: boolean) {
    start(async () => {
      if (is) await flush({ done: true });
      else {
        const res = await sectionDoneAction(invitationId, current, false);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setDone(res.data.done);
        router.refresh();
      }
    });
  }

  const previewSrc = opening ? `${invitationPath(slug)}?at=${current}` : `${invitationPath(slug)}?bare=1&at=${current}`;

  // One column on a phone, two on a desk: the form and the phone. Every column
  // is min-w-0 so a wide list cannot set the page's width and zoom it out.
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_27rem]">
      <section className="min-w-0">
        <GetStarted invitationId={invitationId} lines={checklist} send={send} />

        <div className="mb-4 space-y-2">
          {live ? (
            <Notice tone="info">
              Your invitation is live, so this is how it stands rather than something to change here.
              Revisions happen before we publish; anything that still needs fixing is ours to do — message us on Messenger or Viber and we will sort it out.
            </Notice>
          ) : closed && changes ? (
            <Notice tone="warn">Changes closed on {when(changes.closesAt)}, three weeks before your event. Your invitation is with our team for the final touches, done by {when(changes.finalAt)}. Message us for anything urgent.</Notice>
          ) : allDone ? (
            <Notice tone="ok">Every part is marked done{completedAt ? ` (${when(completedAt)})` : ''} — our team has your invitation. You can still open a part to change something{changes ? ` until ${when(changes.closesAt)}` : ''}.</Notice>
          ) : null}
        </div>
        {!closed && <QuickChoices invitationId={invitationId} lang={lang} lookKey={lookKey} looks={looks} allLooks={allLooks} tier={tier} onChanged={() => setVersion((k) => k + 1)} />}

        <ol data-tour="steps" aria-label="The parts of your invitation" className="mb-4 flex flex-wrap gap-1">
          {sections.map((s, i) => {
            const n = sections.slice(0, i + 1).filter((x) => x.unlocked).length;
            const on = s.key === current;
            return (
              <li key={s.key}>
                {s.unlocked ? (
                  <Link href={`/account/invitations/${invitationId}?section=${s.key}`} aria-current={on ? 'step' : undefined} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${on ? 'border-[color:var(--color-plum-600)] bg-[color:var(--color-plum-600)] text-white' : 'border-[color:var(--color-sand-200)] bg-white hover:bg-[color:var(--color-sand-100)]'}`}>
                    <span className={`tabular-nums ${on ? 'text-white/80' : 'text-[color:var(--color-ink-500)]'}`}>{n}</span>
                    {s.label}
                    {done.includes(s.key) ? <span aria-label="Done" className={on ? 'text-white' : 'text-[color:var(--ok)]'}>✓</span> : s.filled ? <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-white/70' : 'bg-[color:var(--warn)]'}`} /> : null}
                  </Link>
                ) : (
                  <Link href={`/account/invitations/${invitationId}/upgrade`} className="flex items-center gap-1.5 rounded-full border border-dashed border-[color:var(--color-sand-300)] px-3 py-1 text-xs text-[color:var(--color-ink-500)] hover:bg-[color:var(--color-sand-100)]" title={`Included from ${TIER_LABELS[s.minTier]}`}>
                    <span aria-hidden>🔒</span>
                    {s.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>

        <header className="mb-3">
          <p className="eyebrow">Part {stepNo} of {total}</p>
          <h2 className="display text-2xl">{section?.label} {isDone && <span className="pill pill-ok align-middle text-xs">Done</span>}</h2>
          <p className="text-sm text-[color:var(--color-ink-500)]">{section?.description}</p>
        </header>

        {/*
          Said before it happens, not after. A part left empty is a choice a
          customer is allowed to make — some couples have no story page to
          write and no programme to give — and the invitation is shorter for
          it. What is not allowed is finding that out from the finished page,
          so the form says plainly what an empty part means here.
        */}
        {hidesWhenEmpty && !section?.filled && !isDone && !closed && (
          <p className="mb-3 rounded-lg border border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)] px-3 py-2 text-xs text-[color:var(--color-ink-700)]">
            Nothing here yet. Left empty, <b>{section?.label}</b> will not appear on your invitation at all, and that is a perfectly good choice — mark it done to say so. If you decide you would like it after publishing, we will gladly add it, and it will be counted as one revision round.
          </p>
        )}
        <fieldset disabled={closed} className="min-w-0 border-0 p-0" data-tour="form">
          <SectionFields fields={fields} value={value} onChange={change} lang={lang} invitationId={invitationId} listLimits={listLimits} listHints={listHints} />
        </fieldset>

        {!closed && (
          <div className="sticky bottom-0 z-30 mt-6 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)] py-3">
            <span data-tour="done" className="flex flex-wrap items-center gap-2">
              {isDone ? (
                <>
                  <span className="pill pill-ok">✓ Marked done</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => markDone(false)} disabled={pending}>Not done yet</button>
                </>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => markDone(true)} disabled={pending}>✓ Mark this part done</button>
              )}
            </span>
            {next && <Link href={`/account/invitations/${invitationId}?section=${next.key}`} className="btn btn-secondary btn-sm">Next: {next.label} →</Link>}
            <span data-tour="saving" className="ml-auto text-xs" aria-live="polite">
              {state === 'saving' || pending ? (
                <span className="text-[color:var(--color-ink-500)]">Saving…</span>
              ) : state === 'error' ? (
                <span role="alert" className="text-[color:var(--bad)]">{error || 'Something went wrong — try again.'}</span>
              ) : state === 'dirty' ? (
                <span className="text-[color:var(--color-ink-500)]">Saving in a moment…</span>
              ) : state === 'saved' && savedAt ? (
                notes.length ? (
                  <span className="text-[color:var(--warn)]" title={notes.join('; ')}>Saved, with a note: {notes[0]}</span>
                ) : (
                  <span className="text-[color:var(--ok)]">Saved {savedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>
                )
              ) : (
                <span className="text-[color:var(--color-ink-500)]">Auto-save on</span>
              )}
            </span>
          </div>
        )}
      </section>

      <aside data-tour="phone" className={`min-w-0 lg:sticky lg:top-4 lg:block lg:self-start ${sheet ? 'fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[#1f1d1a]/85 p-4 lg:static lg:z-auto lg:bg-transparent lg:p-0' : 'hidden'}`}>
        <div className="mb-2 flex w-full max-w-[410px] items-center justify-between gap-2">
          <p className={`text-xs font-semibold uppercase tracking-wide ${sheet ? 'text-white lg:text-[color:var(--color-ink-500)]' : 'text-[color:var(--color-ink-500)]'}`}>Your page, live</p>
          <span className={`flex items-center gap-2 text-xs ${sheet ? 'text-white lg:text-inherit' : ''}`}>
            <button type="button" className={`rounded-full border px-2 py-0.5 ${opening ? 'border-[color:var(--color-plum-600)] bg-[color:var(--color-plum-600)] text-white' : 'border-[color:var(--color-sand-300)] bg-white text-[color:var(--color-ink-700)]'}`} onClick={() => setOpening((o) => !o)} title="Play the envelope or clip your guests see first">
              {opening ? 'Opening: on' : 'Opening: off'}
            </button>
            <a href={invitationPath(slug)} target="_blank" rel="noopener" className="underline">Open in a new tab</a>
          </span>
        </div>
        <div className="builder-phone w-full">
          <PhonePreview key={opening ? 'opening' : 'bare'} src={previewSrc} version={version} />
        </div>
        {sheet && <button type="button" className="btn btn-secondary lg:hidden" onClick={() => setSheet(false)}>Close</button>}
      </aside>
      {!sheet && <button type="button" className="btn btn-primary fixed bottom-16 right-4 z-40 shadow-lg lg:hidden" onClick={() => setSheet(true)}>Preview</button>}
    </div>
  );
}

/**
 * The phone, reloaded without a blink. Two frames sit in the bezel; the
 * one in front shows the last save, the one behind loads the next, and
 * they swap only once the new page has arrived — so the customer never
 * watches a blank screen between one save and the next.
 */
function PhonePreview({ src, version }: { src: string; version: number }) {
  const at = (v: number) => `${src}&v=${v}`;
  const [slots, setSlots] = useState<[{ src: string; v: number }, { src: string; v: number }]>([{ src: at(0), v: 0 }, { src: '', v: -1 }]);
  const [front, setFront] = useState<0 | 1>(0);
  useEffect(() => {
    setSlots((s) => {
      if (s[front].v === version) return s;
      const back = front === 0 ? 1 : 0;
      const copy: typeof s = [s[0], s[1]];
      copy[back] = { src: at(version), v: version };
      return copy;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, front]);
  const arrived = (i: 0 | 1) => {
    if (i !== front && slots[i].v === version) setFront(i);
  };
  return (
    <div className="phone mx-auto">
      {([0, 1] as const).map((i) =>
        slots[i].src ? (
          <iframe key={i} src={slots[i].src} title={i === front ? 'Your page' : 'Loading your page'} onLoad={() => arrived(i)} style={{ visibility: i === front ? 'visible' : 'hidden', zIndex: i === front ? 2 : 1 }} />
        ) : null,
      )}
    </div>
  );
}

/**
 * Two choices that belong to the whole invitation rather than one part, so
 * they sit above every part: the language the guest page speaks, and the
 * look — the fonts and the lines under the headings — it is set in. Every
 * package may pick either. The design's own look is the blank choice.
 */
function QuickChoices({ invitationId, lang, lookKey, looks, allLooks, tier, onChanged }: { invitationId: string; lang: 'en' | 'tl'; lookKey: string; looks: { key: string; name: string; tagline: string }[]; allLooks: number; tier: Tier; onChanged: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const res = await fn();
      setNote(res.ok ? done : res.error ?? 'Something went wrong.');
      if (res.ok) {
        onChanged();
        router.refresh();
      }
    });
  return (
    <details className="mb-4 rounded-xl border border-[color:var(--color-sand-200)] bg-white">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Language &amp; font style <span className="font-normal text-[color:var(--color-ink-500)]">· {lang === 'tl' ? 'Tagalog' : 'English'}, {looks.find((l) => l.key === lookKey)?.name ?? 'the design’s own fonts'}</span></summary>
      <div className="grid gap-3 border-t border-[color:var(--color-sand-100)] p-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="quick-lang">Guest page language</label>
          <select id="quick-lang" className="field" value={lang} disabled={pending} onChange={(e) => run(() => languageAction(invitationId, e.target.value as 'en' | 'tl'), e.target.value === 'tl' ? 'Tagalog it is.' : 'English it is.')}>
            <option value="en">English</option>
            <option value="tl">Tagalog / Taglish</option>
          </select>
          <p className="hint">The fixed words on the page — buttons, labels, the lines under the headings. Your own words stay as you typed them.</p>
        </div>
        <div>
          <label className="label" htmlFor="quick-look">Font style</label>
          {looks.length <= 1 ? (
            <p className="field flex items-center text-[color:var(--color-ink-soft)]">{looks[0]?.name ?? 'The design’s own'}</p>
          ) : (
            <select id="quick-look" className="field" value={lookKey} disabled={pending} onChange={(e) => run(() => themeAction(invitationId, { lookKey: e.target.value }), e.target.value ? 'Font style applied.' : 'Back to the design’s own fonts.')}>
              <option value="">The design’s own</option>
              {looks.map((l) => <option key={l.key} value={l.key}>{l.name} — {l.tagline}</option>)}
            </select>
          )}
          <p className="hint">{note || (looks.length <= 1
            ? `A set of faces and the lines written under each heading. The ${TIER_LABELS[tier]} package is set in one.`
            : `A set of faces and the lines written under each heading. The ${TIER_LABELS[tier]} package chooses from ${looks.length}${looks.length < allLooks ? `; the ${TIER_LABELS.COMPLETE} package from all ${allLooks}` : ''}.`)}</p>
        </div>
      </div>
    </details>
  );
}
