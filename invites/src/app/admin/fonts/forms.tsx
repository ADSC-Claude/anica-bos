'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { saveFaceAction, toggleFaceAction, deleteFaceAction, saveSetAction, toggleSetAction, deleteSetAction, type Said } from './actions';

/**
 * The Fonts page's forms.
 *
 * A client component for one reason: every name here is drawn in its own
 * face, and the point of that is to read the menu rather than the font
 * names — so the row has to re-draw the moment she changes which face a
 * part uses, without a round trip. Everything that writes is a server
 * action; nothing about a font file or a licence is decided here.
 */

export type Face = { key: string; name: string; family: string; stack: string; source: 'GOOGLE' | 'FILE'; weights: string; url: string; licence: string; enabled: boolean; sortOrder: number; usedBy: string[] };
export type Set = { key: string; name: string; displayKey: string; bodyKey: string; namesKey: string; scriptKey: string; scriptStyle: string; voice: string; minTier: string; enabled: boolean; sortOrder: number; drawnOn: string[] };
export type Sample = { name: string; lines: { en: string; tl: string }; heading: { en: string; tl: string }; body: { en: string; tl: string } };

function useSaid() {
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<Said>) =>
    start(async () => {
      const r = await fn();
      setSaid(r.ok ? { ok: true, text: r.said } : { ok: false, text: r.error });
    });
  const Said = () => (said ? <p role={said.ok ? undefined : 'alert'} className={`mt-1 text-xs ${said.ok ? 'text-[color:var(--ok)]' : 'text-[color:var(--bad)]'}`}>{said.text}</p> : null);
  return { pending, run, Said };
}

const TIERS = ['BASIC', 'STANDARD', 'COMPLETE', 'LUXURY'] as const;

/* ------------------------------------------------------------------ faces */

export function FaceList({ faces, voices }: { faces: Face[]; voices: string[] }) {
  return (
    <div className="space-y-1">
      {faces.map((f) => <FaceRow key={f.key} face={f} />)}
      <details className="rounded-lg border border-dashed border-[color:var(--color-sand-300)] p-3">
        <summary className="cursor-pointer text-sm font-medium">+ Add a face</summary>
        <FaceForm voices={voices} />
      </details>
    </div>
  );
}

function FaceRow({ face }: { face: Face }) {
  const { pending, run, Said } = useSaid();
  return (
    <details className={`rounded-lg border p-2 ${face.enabled ? 'border-[color:var(--color-sand-300)]' : 'border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)] opacity-70'}`}>
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-2">
        {/* the whole point: the name in the face itself */}
        <span className="text-xl leading-tight" style={{ fontFamily: face.stack }}>{face.name}</span>
        <span className="text-xs text-[color:var(--color-ink-500)]">{face.family}</span>
        <span className={`pill ${face.source === 'FILE' ? 'pill-info' : ''} text-[10px]`}>{face.source === 'FILE' ? 'ours' : 'Google'}</span>
        {!face.enabled && <span className="pill pill-bad text-[10px]">off</span>}
        <span className="text-[10px] text-[color:var(--color-ink-500)]">{face.usedBy.length ? `in ${face.usedBy.length}` : 'in none'}</span>
      </summary>
      <FaceForm face={face} voices={[]} />
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-sand-200)] pt-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => toggleFaceAction(face.key, !face.enabled))}>
          {face.enabled ? 'Switch off' : 'Switch on'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => deleteFaceAction(face.key))}>Delete</button>
        {face.usedBy.length > 0 && <span className="hint mb-0">In {face.usedBy.join(', ')}.</span>}
        <Said />
      </div>
    </details>
  );
}

function FaceForm({ face, voices }: { face?: Face; voices: string[] }) {
  void voices;
  const { pending, run, Said } = useSaid();
  const [source, setSource] = useState<'GOOGLE' | 'FILE'>(face?.source ?? 'GOOGLE');
  const [family, setFamily] = useState(face?.family ?? '');
  const [stack, setStack] = useState(face?.stack ?? '');
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => saveFaceAction(face?.key ?? null, fd));
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Labelled label="Family name" hint={source === 'GOOGLE' ? 'Exactly as fonts.google.com writes it — it is case-sensitive, and a wrong one makes every face on the page fall back.' : 'What the rule declares and the page asks for. It need not match anything inside the file.'}>
          <input name="family" className="field" value={family} onChange={(e) => { setFamily(e.target.value); if (!stack) setStack(''); }} required />
        </Labelled>
        <Labelled label="What you call it">
          <input name="name" className="field" defaultValue={face?.name ?? ''} placeholder={family} />
        </Labelled>
      </div>
      <Labelled label="Fallback chain" hint="This family first, then what to draw in until it arrives. Only ever seen when the font does not load.">
        <input name="stack" className="field font-mono text-xs" value={stack} onChange={(e) => setStack(e.target.value)} placeholder={family ? `'${family}', Georgia, serif` : "'Family', Georgia, serif"} />
      </Labelled>
      <div className="grid gap-2 sm:grid-cols-2">
        <Labelled label="Where it comes from">
          <select name="source" className="field" value={source} onChange={(e) => setSource(e.target.value as 'GOOGLE' | 'FILE')}>
            <option value="GOOGLE">Google Fonts — free, nothing to license</option>
            <option value="FILE">A file of ours — licensed and uploaded</option>
          </select>
        </Labelled>
        {source === 'GOOGLE' ? (
          <Labelled label="Weights" hint="The axes after the family in a Google request. Leave blank for the usual four.">
            <input name="weights" className="field font-mono text-xs" defaultValue={face?.weights ?? ''} placeholder="wght@400;500;600;700" />
          </Labelled>
        ) : (
          <Labelled label="The file" hint=".woff2 for preference — smallest, and every browser reads it. 1 MB at most.">
            <input name="file" type="file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" className="field" />
          </Labelled>
        )}
      </div>
      {source === 'FILE' && (
        <>
          <input type="hidden" name="url" value={face?.url ?? ''} />
          <Labelled label="Licence note" hint="The foundry and the date, or the licence name. Required. The system cannot check a licence; it can only refuse to serve one nobody has vouched for.">
            <input name="licence" className="field" defaultValue={face?.licence ?? ''} placeholder="Web licence bought from the foundry, 10 September 2026" />
          </Labelled>
          {face?.url && <p className="hint">Serving <code className="text-[10px]">{face.url}</code></p>}
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="enabled" defaultChecked={face?.enabled ?? true} /> On</label>
        <label className="flex items-center gap-1.5 text-sm">Order <input name="sortOrder" type="number" className="field h-8 w-20 min-h-0" defaultValue={face?.sortOrder ?? 0} /></label>
        <button className="btn btn-primary btn-sm" disabled={pending} type="submit">{face ? 'Save' : 'Add'}{pending ? '…' : ''}</button>
      </div>
      <Said />
    </form>
  );
}

/* --------------------------------------------------------------- pairings */

export function SetList({ sets, faces, voices, samples }: { sets: Set[]; faces: Face[]; voices: string[]; samples: Record<string, Sample> }) {
  return (
    <div className="space-y-1">
      {sets.map((s) => <SetRow key={s.key} set={s} faces={faces} voices={voices} sample={samples[s.voice]} />)}
      <details className="rounded-lg border border-dashed border-[color:var(--color-sand-300)] p-3">
        <summary className="cursor-pointer text-sm font-medium">+ Add a pairing</summary>
        <SetForm faces={faces} voices={voices} />
      </details>
    </div>
  );
}

function SetRow({ set, faces, voices, sample }: { set: Set; faces: Face[]; voices: string[]; sample?: Sample }) {
  const { pending, run, Said } = useSaid();
  const by = (key: string) => faces.find((f) => f.key === key);
  const stack = (key: string, fallback?: string): string | undefined => by(key)?.stack ?? (fallback ? by(fallback)?.stack : undefined);
  return (
    <details className={`rounded-lg border p-3 ${set.enabled ? 'border-[color:var(--color-sand-300)]' : 'border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)] opacity-70'}`}>
      <summary className="cursor-pointer">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium">{set.name}</span>
          <span className="pill text-[10px]">{set.minTier === 'BASIC' ? 'every package' : `${set.minTier} & up`}</span>
          <span className="text-[10px] text-[color:var(--color-ink-500)]">speaks in {set.voice}</span>
          {!set.enabled && <span className="pill pill-bad text-[10px]">off</span>}
          {set.drawnOn.length > 0 && <span className="text-[10px] text-[color:var(--color-ink-500)]">{set.drawnOn.join(', ')}</span>}
        </span>
        {/*
          * A sample line in both languages, drawn in the pairing's own
          * faces. Both languages because the wording is written twice and a
          * face that has no ñ or no long vowels shows it here rather than on
          * somebody's invitation.
          */}
        {sample && (
          <span className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {(['en', 'tl'] as const).map((lang) => (
              <span key={lang} className="block rounded border border-[color:var(--color-sand-200)] bg-white px-2.5 py-2">
                <span className="block text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-ink-500)]">{lang === 'en' ? 'English' : 'Tagalog'}</span>
                <span className="block text-[0.7rem] leading-snug" style={{ fontFamily: stack(set.scriptKey, set.displayKey), fontStyle: set.scriptStyle === 'italic' ? 'italic' : 'normal' }}>{sample.lines[lang]}</span>
                <span className="block text-2xl leading-tight" style={{ fontFamily: stack(set.namesKey, set.displayKey) }}>{sample.name}</span>
                <span className="block text-sm uppercase tracking-[0.2em]" style={{ fontFamily: stack(set.displayKey) }}>{sample.heading[lang]}</span>
                <span className="block text-xs leading-snug" style={{ fontFamily: stack(set.bodyKey) }}>{sample.body[lang]}</span>
              </span>
            ))}
          </span>
        )}
      </summary>
      <SetForm set={set} faces={faces} voices={voices} />
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-sand-200)] pt-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => toggleSetAction(set.key, !set.enabled))}>
          {set.enabled ? 'Switch off' : 'Switch on'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => deleteSetAction(set.key))}>Delete</button>
        <Said />
      </div>
    </details>
  );
}

function SetForm({ set, faces, voices }: { set?: Set; faces: Face[]; voices: string[] }) {
  const { pending, run, Said } = useSaid();
  const on = faces.filter((f) => f.enabled);
  const [parts, setParts] = useState({
    displayKey: set?.displayKey ?? on[0]?.key ?? '',
    bodyKey: set?.bodyKey ?? on[0]?.key ?? '',
    namesKey: set?.namesKey ?? '',
    scriptKey: set?.scriptKey ?? '',
  });
  const stack = (key: string) => faces.find((f) => f.key === key)?.stack;
  const Part = ({ part, label, hint, blank }: { part: keyof typeof parts; label: string; hint?: string; blank?: string }) => (
    <Labelled label={label} hint={hint}>
      <select name={part} className="field" value={parts[part]} onChange={(e) => setParts({ ...parts, [part]: e.target.value })} style={{ fontFamily: stack(parts[part]) }}>
        {blank && <option value="">{blank}</option>}
        {on.map((f) => <option key={f.key} value={f.key} style={{ fontFamily: f.stack }}>{f.name}</option>)}
      </select>
    </Labelled>
  );
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => saveSetAction(set?.key ?? null, fd));
      }}
    >
      <Labelled label="What you call it" hint="What she picks it by, so say the faces: “Playfair Display / Lato”.">
        <input name="name" className="field" defaultValue={set?.name ?? ''} required />
      </Labelled>
      <div className="grid gap-2 sm:grid-cols-2">
        <Part part="displayKey" label="The headings" />
        <Part part="bodyKey" label="To read" />
        <Part part="namesKey" label="The names" blank="— the heading face —" />
        <Part part="scriptKey" label="The lines under the headings" blank="— the heading face —" />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Labelled label="That face's slant" hint="An italic serif can play the part of a script.">
          <select name="scriptStyle" className="field" defaultValue={set?.scriptStyle ?? 'normal'}>
            <option value="normal">Upright</option>
            <option value="italic">Italic</option>
          </select>
        </Labelled>
        <Labelled label="Speaks in" hint="Whose wording goes under the headings, in both languages.">
          <select name="voice" className="field" defaultValue={set?.voice ?? voices[0]}>
            {voices.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Labelled>
        <Labelled label="Lowest package" hint="A design's own set is served whatever the package; this is about choosing another.">
          <select name="minTier" className="field" defaultValue={set?.minTier ?? 'COMPLETE'}>
            {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Labelled>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="enabled" defaultChecked={set?.enabled ?? true} /> On</label>
        <label className="flex items-center gap-1.5 text-sm">Order <input name="sortOrder" type="number" className="field h-8 w-20 min-h-0" defaultValue={set?.sortOrder ?? 0} /></label>
        <button className="btn btn-primary btn-sm" disabled={pending} type="submit">{set ? 'Save' : 'Add'}{pending ? '…' : ''}</button>
      </div>
      <Said />
    </form>
  );
}

function Labelled({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}
