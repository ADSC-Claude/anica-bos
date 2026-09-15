'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PREVIEW_FIELDS } from '@/lib/preview';

/**
 * The design, beside the form, while she fills it in.
 *
 * The form is server-rendered and uncontrolled — plain inputs with names,
 * which is why it works without JavaScript and why a Save is one POST. So
 * this does not try to own those fields: it finds the form by its id, reads
 * the handful it cares about off `form.elements`, and re-points an iframe at
 * the preview route. Nothing about the form changes, and with JavaScript off
 * the page is exactly what it was before, minus a picture.
 *
 * Half a second of quiet before it reloads. Typing a hex code is six
 * keystrokes and reloading on each one would show her five wrong colours on
 * the way to the right one.
 */
export function PreviewPanel({ templateId, sitter, ownDemo }: { templateId: string; sitter: string; ownDemo: boolean }) {
  const [mode, setMode] = useState<'day' | 'night'>('day');
  const [src, setSrc] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);

  const read = useCallback(() => {
    const form = document.getElementById('template-form');
    if (!(form instanceof HTMLFormElement)) return '';
    const q = new URLSearchParams();
    for (const name of PREVIEW_FIELDS) {
      const el = form.elements.namedItem(name);
      // namedItem hands back a RadioNodeList when several controls share a
      // name; every field read here is a single input or select, and its
      // `value` is the one thing wanted off it.
      const value = el && 'value' in el ? String(el.value ?? '').trim() : '';
      if (value) q.set(name, value);
    }
    q.set('mode', mode);
    // the pages as the studio is drawing them, not only as last published
    q.set('design', 'draft');
    return `/preview/template/${templateId}?${q.toString()}`;
  }, [mode, templateId]);

  useEffect(() => {
    const form = document.getElementById('template-form');
    if (!form) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setSrc(read()), 500);
    };
    setSrc(read());
    form.addEventListener('input', schedule);
    form.addEventListener('change', schedule);
    return () => {
      clearTimeout(timer);
      form.removeEventListener('input', schedule);
      form.removeEventListener('change', schedule);
    };
  }, [read]);

  return (
    <div className="card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="label mb-0">As it stands</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode(mode === 'day' ? 'night' : 'day')}
            className="btn btn-ghost btn-sm"
            aria-pressed={mode === 'night'}
          >
            {mode === 'day' ? 'Night' : 'Day'}
          </button>
          {/* The row may have moved under it — a picture uploaded, a word saved — and the fields have not. */}
          <button type="button" onClick={() => frame.current?.contentWindow?.location.reload()} className="btn btn-ghost btn-sm">
            Refresh
          </button>
          {src && (
            <a href={src} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              Whole page ↗
            </a>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-[color:var(--color-sand-300)] bg-white">
        {src ? (
          /*
           * One iframe, re-pointed. Not keyed to the URL on purpose: a keyed
           * frame is a new element on every change, which means an empty
           * white box while the next page loads, where re-pointing leaves the
           * last page up until the new one paints.
           */
          <iframe ref={frame} src={src} title="The design as the form stands" className="block h-[680px] w-full" style={{ border: 0 }} />
        ) : (
          <p className="hint p-6">Turn on JavaScript to see the design beside the form.</p>
        )}
      </div>
      <p className="hint mt-2">
        The colours, the fonts, the set and the layout follow the form as you change them — nothing is saved until you press Save.
        The design&rsquo;s own words and pictures are shown as they were last saved, and the pages as the studio is drawing them.
      </p>
      <p className="hint mt-1">
        Drawn on <strong>{sitter}</strong>
        {ownDemo ? ', this design’s own demo.' : ' — this design has no demo of its own, so somebody else’s invitation is sitting for it. Give it one above to draw it on the real thing.'}
      </p>
    </div>
  );
}
