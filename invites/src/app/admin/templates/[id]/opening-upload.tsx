'use client';

import { useRef, useState } from 'react';
import { readClip, sendClip } from './design/clip';
import { VIDEO_MAX_LABEL, VIDEO_MAX_MS } from '@/lib/clips';

/**
 * The design's own premium opening: one file chooser instead of two pasted
 * addresses.
 *
 * These two columns are what lets a design drawn in the studio sell an
 * opening of its own — `premiumOpeningsFor` makes a catalogue entry out of
 * them when nothing in the catalogue matches. Before this they were two text
 * boxes wanting URLs, which meant the clip had to be uploaded somewhere else
 * first and the poster made by hand, and the poster is the one that gets
 * forgotten: it is the whole closed screen until the guest taps, so a clip
 * without one leaves them looking at nothing.
 *
 * So the clip is read and checked in the browser, the still is taken off a
 * real frame of it, both are uploaded, and both boxes fill at once. The
 * boxes stay, and stay editable: the two openings this app ships live at
 * `/openings/…` and were never uploaded here.
 */
export function OpeningUpload({ templateId, video, poster }: { templateId: string; video: string; poster: string }) {
  const [pair, setPair] = useState({ video, poster });
  const [step, setStep] = useState('');
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const busy = step !== '';
  async function take(file: File) {
    setError('');
    setNote('');
    setPct(0);
    try {
      setStep('Reading the clip…');
      const read = await readClip(file);
      if (read.note) setNote(read.note);
      setStep('Uploading…');
      const sent = await sendClip(read, templateId, setPct);
      setPair({ video: sent.url, poster: sent.poster });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStep('');
      setPct(0);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-[color:var(--color-sand-200)] p-3">
      <p className="label">The design&rsquo;s own premium opening</p>
      <p className="hint">
        A portrait clip, muted, a few seconds — at most {VIDEO_MAX_LABEL} and {VIDEO_MAX_MS / 1000} seconds. Pick the file and the still behind it is taken off the clip itself.
        With both set, this design sells the premium opening add-on and plays this clip for the customers who buy it, over whatever opening is chosen above.
        The couple&rsquo;s names are <b>not</b> set on it — a clip added this way is played as it is, so anything it should say has to be in the artwork.
      </p>
      <div className="flex items-start gap-3">
        {pair.poster
          ? <img src={pair.poster} alt="" className="w-20 shrink-0 rounded border border-[color:var(--color-sand-200)]" />
          : <span className="h-28 w-20 shrink-0 rounded border border-dashed border-[color:var(--color-sand-300)]" />}
        <div className="min-w-0 flex-1 space-y-2">
          <label className={`btn btn-secondary btn-sm ${busy ? 'opacity-60' : 'cursor-pointer'}`}>
            {busy ? (pct > 0 && pct < 100 ? `${step} ${pct}%` : step) : pair.video ? 'Replace the clip' : 'Upload a clip'}
            <input ref={input} type="file" accept="video/mp4,video/webm" className="sr-only" disabled={busy}
              onChange={(e) => e.target.files?.[0] && take(e.target.files[0])} />
          </label>
          <label className="block">
            <span className="label">Clip</span>
            <input name="openingVideoUrl" type="text" value={pair.video} placeholder="/openings/…"
              onChange={(e) => setPair((x) => ({ ...x, video: e.target.value }))} className="field font-mono text-xs" />
          </label>
          <label className="block">
            <span className="label">The still behind it</span>
            <input name="openingPosterUrl" type="text" value={pair.poster} placeholder="/openings/…-poster.jpg"
              onChange={(e) => setPair((x) => ({ ...x, poster: e.target.value }))} className="field font-mono text-xs" />
          </label>
          {(pair.video || pair.poster) && !busy && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPair({ video: '', poster: '' })}>Take the opening off this design</button>
          )}
        </div>
      </div>
      {error && <p className="hint text-[color:var(--bad)]">{error}</p>}
      {note && <p className="hint">{note}</p>}
      {Boolean(pair.video) !== Boolean(pair.poster) && !busy && (
        <p className="hint text-[color:var(--warn)]">Both or neither: the still is the whole closed screen until the guest taps, so a clip without one leaves them on a blank screen. With only one set, the opening is not offered at all.</p>
      )}
    </div>
  );
}
