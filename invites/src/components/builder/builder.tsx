'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Tier } from '@prisma/client';
import type { Field, SectionData, SectionKey } from '@/lib/sections';
import type { Lang } from '@/lib/copy';
import { TIER_LABELS } from '@/lib/tiers';
import { SectionFields } from './fields';
import { saveSectionAction } from '@/app/account/actions';

export type BuilderSection = { key: SectionKey; label: string; description: string; unlocked: boolean; filled: boolean; minTier: Tier };

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
  editsLeft,
}: {
  invitationId: string;
  slug: string;
  status: string;
  sections: BuilderSection[];
  current: SectionKey;
  fields: Field[];
  initial: SectionData;
  lang: Lang;
  listLimits: Record<string, number>;
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

  const filled = sections.filter((s) => s.filled && s.unlocked).length;
  const total = sections.filter((s) => s.unlocked).length;
  const index = sections.findIndex((s) => s.key === current);
  const next = sections.slice(index + 1).find((s) => s.unlocked);
  const section = sections[index];

  function save(goNext = false) {
    setError('');
    setMessage('');
    start(async () => {
      const res = await saveSectionAction(invitationId, current, value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDirty(false);
      setMessage(res.data.issues.length ? `Saved, with notes: ${res.data.issues.map((i) => `${i.path} — ${i.message}`).join('; ')}` : 'Saved.');
      setPreviewKey((k) => k + 1);
      router.refresh();
      if (goNext && next) router.push(`/account/invitations/${invitationId}/builder?section=${next.key}`);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr_22rem]">
      <nav aria-label="Sections" className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex items-center justify-between text-xs text-[color:var(--color-ink-500)]">
          <span>{filled} of {total} sections</span>
          <span>{Math.round((filled / Math.max(1, total)) * 100)}%</span>
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-[color:var(--color-sand-200)]"><div className="h-full rounded-full bg-[color:var(--color-plum-600)]" style={{ width: `${Math.round((filled / Math.max(1, total)) * 100)}%` }} /></div>
        <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {sections.map((s) => (
            <li key={s.key} className="shrink-0">
              {s.unlocked ? (
                <Link href={`/account/invitations/${invitationId}/builder?section=${s.key}`} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${s.key === current ? 'bg-[color:var(--color-plum-600)] text-white' : 'hover:bg-[color:var(--color-sand-100)]'}`} aria-current={s.key === current ? 'page' : undefined}>
                  <span aria-hidden className={`h-2 w-2 rounded-full ${s.filled ? 'bg-[color:var(--ok)]' : 'bg-[color:var(--color-sand-300)]'}`} />
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

      <section>
        <header className="mb-4">
          <h2 className="display text-2xl">{section?.label}</h2>
          <p className="text-sm text-[color:var(--color-ink-500)]">{section?.description}</p>
          {editsLeft !== null && status === 'PUBLISHED' && (
            <p className="mt-1 text-xs text-[color:var(--warn)]">{editsLeft} edit{editsLeft === 1 ? '' : 's'} left after publishing on your package. Each save counts as one.</p>
          )}
        </header>
        <SectionFields fields={fields} value={value} onChange={(v) => { setValue(v); setDirty(true); }} lang={lang} invitationId={invitationId} listLimits={listLimits} />
        <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)] py-3">
          <button type="button" className="btn btn-primary" onClick={() => save(false)} disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
          {next && <button type="button" className="btn btn-secondary" onClick={() => save(true)} disabled={pending}>Save & next: {next.label}</button>}
          {dirty && !pending && <span className="text-xs text-[color:var(--warn)]">Unsaved changes</span>}
          {message && <span className="text-xs text-[color:var(--ok)]">{message}</span>}
          {error && <span role="alert" className="text-xs text-[color:var(--bad)]">{error}</span>}
        </div>
      </section>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-500)]">Live preview</p>
          <div className="flex gap-1 text-xs">
            <button type="button" className={`rounded px-2 py-1 ${device === 'phone' ? 'bg-[color:var(--color-sand-200)]' : ''}`} onClick={() => setDevice('phone')}>Phone</button>
            <button type="button" className={`rounded px-2 py-1 ${device === 'desktop' ? 'bg-[color:var(--color-sand-200)]' : ''}`} onClick={() => setDevice('desktop')}>Desktop</button>
          </div>
        </div>
        {device === 'phone' ? (
          <div className="phone mx-auto">
            <iframe key={previewKey} src={`/i/${slug}?preview=1`} title="Preview" />
          </div>
        ) : (
          <div className="aspect-[4/5] w-full overflow-hidden rounded-xl border border-[color:var(--color-sand-200)] bg-white">
            <iframe key={previewKey} src={`/i/${slug}?preview=1`} title="Preview" className="h-full w-full border-0" />
          </div>
        )}
        <p className="mt-2 text-center text-xs text-[color:var(--color-ink-500)]"><a href={`/i/${slug}?preview=1`} target="_blank" rel="noopener" className="underline">Open preview in a new tab</a></p>
      </aside>
    </div>
  );
}
