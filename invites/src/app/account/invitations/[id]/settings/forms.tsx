'use client';

import { useState, useTransition } from 'react';
import type { Palette } from '@/lib/theme';
import { settingsAction, themeAction, templateAction } from '@/app/account/actions';

function useRun() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText = 'Saved.') =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? 'Something went wrong.' });
    });
  const Msg = () => (msg ? <p role={msg.ok ? undefined : 'alert'} className={`text-sm ${msg.ok ? 'text-[color:var(--ok)]' : 'text-[color:var(--bad)]'}`}>{msg.text}</p> : null);
  return { pending, run, Msg };
}

export function SettingsForm(p: { invitationId: string; host: string; slug: string; title: string; privacy: string; language: string; canCustomSlug: boolean; canPassword: boolean; hasPassword: boolean }) {
  const { pending, run, Msg } = useRun();
  const [privacy, setPrivacy] = useState(p.privacy);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => settingsAction(p.invitationId, fd)); }}>
      <div>
        <label className="label" htmlFor="title">Name (shown in the browser tab and link preview)</label>
        <input id="title" name="title" className="field" defaultValue={p.title} />
      </div>
      <div>
        <label className="label" htmlFor="slug">Link</label>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-[color:var(--color-ink-500)]">{p.host}/i/</span>
          <input id="slug" name="slug" className="field" defaultValue={p.slug} disabled={!p.canCustomSlug} pattern="[a-z0-9-]{3,60}" />
        </div>
        <p className="hint">{p.canCustomSlug ? 'Lowercase letters, numbers and dashes.' : 'Custom links are included from the Standard tier.'}</p>
      </div>
      <div>
        <label className="label" htmlFor="privacy">Who can open it</label>
        <select id="privacy" name="privacy" className="field" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
          <option value="PUBLIC">Public — anyone with the link, and search engines may index it</option>
          <option value="UNLISTED">Unlisted — anyone with the link, hidden from search</option>
          <option value="PASSWORD" disabled={!p.canPassword}>Password — guests type a password first{p.canPassword ? '' : ' (Complete tier)'}</option>
        </select>
      </div>
      {privacy === 'PASSWORD' && (
        <div>
          <label className="label" htmlFor="password">{p.hasPassword ? 'New password (leave blank to keep)' : 'Password for guests'}</label>
          <input id="password" name="password" className="field" autoComplete="off" />
        </div>
      )}
      <div>
        <label className="label" htmlFor="language">Guest page language</label>
        <select id="language" name="language" className="field" defaultValue={p.language}>
          <option value="en">English</option>
          <option value="tl">Tagalog / Taglish</option>
        </select>
        <p className="hint">Changes the fixed labels — “Mga Magulang”, “Paki-confirm bago ang…”. Your own wording stays as typed.</p>
      </div>
      <div className="flex items-center gap-3"><button type="submit" className="btn btn-primary" disabled={pending}>Save</button><Msg /></div>
    </form>
  );
}

export function ThemePicker(p: { invitationId: string; palettes: { key: string; label: string; palette: Palette }[]; fonts: { key: string; label: string }[]; current: { paletteKey: string; palette: Palette; fontsKey: string }; canPresets: boolean; canCustom: boolean }) {
  const { pending, run, Msg } = useRun();
  const [custom, setCustom] = useState<Palette>(p.current.palette);
  const [fontsKey, setFontsKey] = useState(p.current.fontsKey);
  return (
    <div className="space-y-4">
      <div>
        <p className="label">Palette presets {!p.canPresets && <span className="pill pill-warn ml-1">Standard tier</span>}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {p.palettes.map((pal) => (
            <button key={pal.key} type="button" disabled={!p.canPresets || pending} onClick={() => run(() => themeAction(p.invitationId, { paletteKey: pal.key }), `Palette: ${pal.label}`)} className={`card flex items-center gap-2 p-2 text-left text-xs ${p.current.paletteKey === pal.key ? 'ring-2 ring-[color:var(--color-plum-600)]' : ''} disabled:opacity-50`}>
              <span className="flex gap-0.5">{[pal.palette.bg, pal.palette.accent, pal.palette.accent2].map((c) => <span key={c} className="h-5 w-5 rounded-full border border-black/10" style={{ background: c }} />)}</span>
              {pal.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="label">Custom colours {!p.canCustom && <span className="pill pill-warn ml-1">Complete tier</span>}</p>
        <div className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
          {(['bg', 'surface', 'ink', 'muted', 'accent', 'accent2'] as (keyof Palette)[]).map((k) => (
            <label key={k} className="flex flex-col items-center gap-1">
              <input type="color" value={custom[k]} disabled={!p.canCustom} onChange={(e) => setCustom({ ...custom, [k]: e.target.value })} className="h-9 w-9 cursor-pointer rounded-full border-0 bg-transparent" />
              {k}
            </label>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm mt-2" disabled={!p.canCustom || pending} onClick={() => run(() => themeAction(p.invitationId, { palette: custom }), 'Custom colours applied.')}>Apply colours</button>
      </div>
      <div>
        <label className="label" htmlFor="fonts">Fonts {!p.canCustom && <span className="pill pill-warn ml-1">Complete tier</span>}</label>
        <div className="flex gap-2">
          <select id="fonts" className="field" value={fontsKey} disabled={!p.canCustom} onChange={(e) => setFontsKey(e.target.value)}>
            <option value="">Template default</option>
            {p.fonts.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button type="button" className="btn btn-secondary" disabled={!p.canCustom || pending || !fontsKey} onClick={() => run(() => themeAction(p.invitationId, { fontsKey }), 'Fonts applied.')}>Apply</button>
        </div>
      </div>
      <Msg />
    </div>
  );
}

export function TemplatePicker(p: { invitationId: string; currentId: string; templates: { id: string; name: string; description: string; thumbnailUrl: string; premium: boolean; layout: string }[] }) {
  const { pending, run, Msg } = useRun();
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {p.templates.map((t) => (
          <button key={t.id} type="button" disabled={pending || t.id === p.currentId} onClick={() => run(() => templateAction(p.invitationId, t.id), `Switched to ${t.name}.`)} className={`card overflow-hidden text-left ${t.id === p.currentId ? 'ring-2 ring-[color:var(--color-plum-600)]' : ''}`}>
            <div className="aspect-[4/5] bg-[color:var(--color-sand-100)]">{t.thumbnailUrl && <img src={t.thumbnailUrl} alt="" className="h-full w-full object-cover" />}</div>
            <div className="p-2 text-sm"><span className="block font-semibold">{t.name}</span><span className="block text-xs text-[color:var(--color-ink-500)]">{t.premium ? 'Premium · ' : ''}{t.layout}</span></div>
          </button>
        ))}
      </div>
      <div className="mt-2"><Msg /></div>
    </div>
  );
}
