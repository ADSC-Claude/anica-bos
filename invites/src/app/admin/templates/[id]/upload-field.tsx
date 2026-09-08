'use client';

import { useRef, useState } from 'react';

/**
 * A URL field with an upload beside it: pick a file, it goes to storage, and
 * the URL lands in the field, so a background or a strand is replaced without
 * leaving the form. The URL can still be pasted by hand.
 */
export function UploadField({ name, label, defaultValue = '', placeholder, templateId, hint }: { name: string; label: string; defaultValue?: string; placeholder?: string; templateId: string; hint?: string }) {
  const [value, setValue] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('templateId', templateId);
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed.');
      setValue(json.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <div>
      <label className="label" htmlFor={`f-${name}`}>{label}</label>
      <div className="flex items-center gap-2">
        {value ? <img src={value} alt="" className="h-12 w-8 shrink-0 rounded border border-[color:var(--color-sand-200)] object-cover" /> : <span className="h-12 w-8 shrink-0 rounded border border-dashed border-[color:var(--color-sand-300)]" />}
        <input id={`f-${name}`} name={name} type="text" value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} className="field font-mono text-xs" />
        <label className={`btn btn-secondary btn-sm shrink-0 ${busy ? 'opacity-60' : 'cursor-pointer'}`}>
          {busy ? 'Uploading…' : 'Upload'}
          <input ref={input} type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {value && <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => setValue('')}>Clear</button>}
      </div>
      {error ? <p className="hint text-[color:var(--bad)]">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}
