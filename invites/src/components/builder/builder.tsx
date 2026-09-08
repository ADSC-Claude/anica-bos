'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Tier } from '@prisma/client';
import type { Field, SectionData, SectionKey } from '@/lib/sections';
import type { Lang } from '@/lib/copy';
import { TIER_LABELS } from '@/lib/tiers';
import { SectionFields } from './fields';
import { saveSectionAction, sectionDoneAction, languageAction, themeAction } from '@/app/account/actions';
import { invitationPath } from '@/lib/app-url';
import { formatDate } from '@/lib/datetime';
import { Notice } from '@/components/ui';

export type BuilderSection = { key: SectionKey; label: string; description: string; unlocked: boolean; filled: boolean; minTier: Tier };

export function Builder({
  invitationId,
  slug,
  status,
  selfServe,
  sections,
  current,
  fields,
  initial,
  lang,
  listLimits,
  listHints,
  editsLeft,
  lookKey,
  allLooks,
  tier,
  looks,
  done: doneInitial,
  completedAt,
  window,
}: {
  invitationId: string;
  /** The sections the couple has marked Done, when the form was completed, and when changes close. */
  done: SectionKey[];
  completedAt: string | null;
  window: { closesAt: string; finalAt: string; closed: boolean } | null;
  slug: string;
  status: string;
  /**
   * DIY: the couple builds and publishes it themselves. Done marks their own
   * progress, nothing is handed to anyone, and there is no closing date — so
   * the notices say that instead of promising a team that is not coming.
   */
  selfServe: boolean;
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
  editsLeft: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<SectionData>(initial);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [device, setDevice] = useState<'phone' | 'desktop'>('phone');
  const [pending, start] = useTransition();
  const [done, setDone] = useState<SectionKey[]>(doneInitial);
  // a section marked Done opens folded: its fields are hidden until Edit is asked for
  const [editing, setEditing] = useState(!doneInitial.includes(current));

  const total = sections.filter((s) => s.unlocked).length;
  const doneCount = sections.filter((s) => s.unlocked && done.includes(s.key)).length;
  const index = sections.findIndex((s) => s.key === current);
  const next = sections.slice(index + 1).find((s) => s.unlocked);
  const nextOpen = sections.find((s) => s.unlocked && !done.includes(s.key) && s.key !== current);
  const section = sections[index];
  const isDone = done.includes(current);
  const closed = Boolean(window?.closed);
  const allDone = total > 0 && doneCount >= total;
  // the dates come over the wire as ISO strings; formatDate wants a Date for those
  const when = (iso: string) => formatDate(new Date(iso));

  /** Save; with markDone the section is marked Done, folded, and the next section still open comes up. */
  function save(goNext = false, markDone = false) {
    setError('');
    setMessage('');
    start(async () => {
      const res = await saveSectionAction(invitationId, current, value, markDone ? { done: true } : {});
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDirty(false);
      setDone(res.data.done);
      setMessage(res.data.issues.length ? `Saved, with notes: ${res.data.issues.map((i) => `${i.path} — ${i.message}`).join('; ')}` : markDone ? 'Saved and marked Done.' : 'Saved.');
      setPreviewKey((k) => k + 1);
      router.refresh();
      if (markDone) {
        setEditing(false);
        const after = sections.slice(index + 1).find((s) => s.unlocked && !res.data.done.includes(s.key)) ?? sections.find((s) => s.unlocked && !res.data.done.includes(s.key));
        if (after) router.push(`/account/invitations/${invitationId}/builder?section=${after.key}`);
      } else if (goNext && next) router.push(`/account/invitations/${invitationId}/builder?section=${next.key}`);
    });
  }

  /** Reopen a Done section to change it; it stays Done, so nothing has to be re-marked. */
  function reopen() {
    setEditing(true);
  }
  /** Take the Done mark off, when the couple wants the section counted as unfinished again. */
  function unmark() {
    start(async () => {
      const res = await sectionDoneAction(invitationId, current, false);
      if (!res.ok) { setError(res.error); return; }
      setDone(res.data.done);
      setEditing(true);
      router.refresh();
    });
  }

  // One column on a phone, three on a desk. Every column is min-w-0: the
  // section pills are a row that scrolls sideways on a phone, and without it
  // their full width would set the page's, zooming the whole form out.
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)_22rem]">
      <nav aria-label="Sections" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex items-center justify-between text-xs text-[color:var(--color-ink-500)]">
          <span>{doneCount} of {total} sections done</span>
          <span>{Math.round((doneCount / Math.max(1, total)) * 100)}%</span>
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-[color:var(--color-sand-200)]"><div className="h-full rounded-full bg-[color:var(--ok)]" style={{ width: `${Math.round((doneCount / Math.max(1, total)) * 100)}%` }} /></div>
        <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {sections.map((s) => (
            <li key={s.key} className="shrink-0">
              {s.unlocked ? (
                <Link href={`/account/invitations/${invitationId}/builder?section=${s.key}`} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${s.key === current ? 'bg-[color:var(--color-plum-600)] text-white' : 'hover:bg-[color:var(--color-sand-100)]'}`} aria-current={s.key === current ? 'page' : undefined}>
                  {done.includes(s.key) ? (
                    <span aria-label="Done" className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${s.key === current ? 'bg-white text-[color:var(--color-plum-600)]' : 'bg-[color:var(--ok)] text-white'}`}>✓</span>
                  ) : (
                    <span aria-hidden className={`mx-1 h-2 w-2 rounded-full ${s.filled ? 'bg-[color:var(--warn)]' : 'bg-[color:var(--color-sand-300)]'}`} />
                  )}
                  {s.label}
                </Link>
              ) : (
                <Link href={`/account/invitations/${invitationId}/upgrade`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[color:var(--color-ink-500)] hover:bg-[color:var(--color-sand-100)]" title={`Included from ${TIER_LABELS[s.minTier]}`}>
                  <span aria-hidden>🔒</span>
                  {s.label}
                  <span className="pill pill-warn ml-auto">Upgrade</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <section className="min-w-0">
        <div className="mb-4 space-y-2">
          {closed && window ? (
            <Notice tone="warn">Changes closed on {when(window.closesAt)}, three weeks before your event. Your invitation is with our team for the final touches, done by {when(window.finalAt)}. Message us for anything urgent.</Notice>
          ) : selfServe ? (
            allDone ? (
              <Notice tone="ok">
                Every section is marked Done{completedAt ? ` (${when(completedAt)})` : ''} — your invitation is ready to {status === 'PUBLISHED' ? 'share' : 'publish'}.
                Open any section whenever you want to change something: nothing closes before your event.
              </Notice>
            ) : (
              <Notice tone="info">
                Fill in each section and press <b>Done</b> when it is complete — it folds away and the next one opens ({doneCount} of {total} so far).
                <b> Done is your own progress mark</b>: nothing is sent anywhere, and you can {status === 'PUBLISHED' ? 'change a published invitation within the revisions your package includes' : 'publish as soon as the cover is filled in'}.
                You can leave and come back any time; everything you save stays with your account.
              </Notice>
            )
          ) : allDone ? (
            <Notice tone="ok">Every section is marked Done{completedAt ? ` (${when(completedAt)})` : ''} — our team has your invitation. You can still open a section to change something{window ? ` until ${when(window.closesAt)}` : ''}.</Notice>
          ) : (
            <Notice tone="info">
              Fill in each section and press <b>Done</b> when it is complete — it folds away and the next one opens. <b>Our team starts on your invitation only once every section is marked Done</b> ({doneCount} of {total} so far).
              You can leave and come back any time; everything you save stays with your account.
              {window && <> Changes close on <b>{when(window.closesAt)}</b>, three weeks before your event; our team finishes the final touches by {when(window.finalAt)}.</>}
            </Notice>
          )}
        </div>
        {!closed && <QuickChoices invitationId={invitationId} lang={lang} lookKey={lookKey} looks={looks} allLooks={allLooks} tier={tier} onChanged={() => setPreviewKey((k) => k + 1)} />}
        <header className="mb-4">
          <h2 className="display text-2xl">{section?.label} {isDone && <span className="pill pill-ok align-middle text-xs">Done</span>}</h2>
          <p className="text-sm text-[color:var(--color-ink-500)]">{section?.description}</p>
          {editsLeft !== null && status === 'PUBLISHED' && (
            <p className="mt-1 text-xs text-[color:var(--warn)]">{editsLeft} edit{editsLeft === 1 ? '' : 's'} left after publishing on your package. Each save counts as one.</p>
          )}
        </header>
        {isDone && !editing ? (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm">✓ This section is done and folded away.</p>
            <div className="flex flex-wrap gap-2">
              {!closed && <button type="button" className="btn btn-secondary btn-sm" onClick={reopen}>Edit this section</button>}
              {!closed && <button type="button" className="btn btn-secondary btn-sm" onClick={unmark} disabled={pending}>Mark as not done</button>}
              {nextOpen && <Link href={`/account/invitations/${invitationId}/builder?section=${nextOpen.key}`} className="btn btn-primary btn-sm">Next to fill: {nextOpen.label}</Link>}
            </div>
            {error && <span role="alert" className="text-xs text-[color:var(--bad)]">{error}</span>}
          </div>
        ) : (
          <>
            <fieldset disabled={closed} className="min-w-0 border-0 p-0">
              <SectionFields fields={fields} value={value} onChange={(v) => { setValue(v); setDirty(true); }} lang={lang} invitationId={invitationId} listLimits={listLimits} listHints={listHints} />
            </fieldset>
            {!closed && (
              <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)] py-3">
                <button type="button" className="btn btn-primary" onClick={() => save(false, true)} disabled={pending}>{pending ? 'Saving…' : isDone ? 'Save & fold away' : 'Done — save & fold away'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => save(false)} disabled={pending}>Save for later</button>
                {next && !isDone && <button type="button" className="btn btn-secondary" onClick={() => save(true)} disabled={pending}>Save & next: {next.label}</button>}
                {dirty && !pending && <span className="text-xs text-[color:var(--warn)]">Unsaved changes</span>}
                {message && <span className="text-xs text-[color:var(--ok)]">{message}</span>}
                {error && <span role="alert" className="text-xs text-[color:var(--bad)]">{error}</span>}
              </div>
            )}
          </>
        )}
      </section>

      <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-500)]">Live preview</p>
          <div className="flex gap-1 text-xs">
            <button type="button" className={`rounded px-2 py-1 ${device === 'phone' ? 'bg-[color:var(--color-sand-200)]' : ''}`} onClick={() => setDevice('phone')}>Phone</button>
            <button type="button" className={`rounded px-2 py-1 ${device === 'desktop' ? 'bg-[color:var(--color-sand-200)]' : ''}`} onClick={() => setDevice('desktop')}>Desktop</button>
          </div>
        </div>
        {device === 'phone' ? (
          <div className="phone mx-auto">
            <iframe key={previewKey} src={`${invitationPath(slug)}?preview=1`} title="Preview" />
          </div>
        ) : (
          <div className="aspect-[4/5] w-full overflow-hidden rounded-xl border border-[color:var(--color-sand-200)] bg-white">
            <iframe key={previewKey} src={`${invitationPath(slug)}?preview=1`} title="Preview" className="h-full w-full border-0" />
          </div>
        )}
        <p className="mt-2 text-center text-xs text-[color:var(--color-ink-500)]"><a href={`${invitationPath(slug)}?preview=1`} target="_blank" rel="noopener" className="underline">Open preview in a new tab</a></p>
      </aside>
    </div>
  );
}


/**
 * Two choices that belong to the whole invitation rather than one section, so
 * they sit above every section: the language the guest page speaks, and the
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
    <div className="mb-5 grid gap-3 rounded-xl border border-[color:var(--color-sand-200)] bg-white p-3 sm:grid-cols-2">
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
  );
}
