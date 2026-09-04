'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The interactive parts of a guest page. Everything else renders on the
 * server. Each of these degrades: without JavaScript the envelope is simply
 * not shown, the countdown shows the date, and the forms post nowhere — so
 * the forms below are the only thing a guest cannot do without it, which is
 * why the RSVP-by-text number is printed beside them.
 */

// ---------------------------------------------------------------------------
// Envelope + music. One component, because the tap that opens the envelope
// is the user gesture that lets audio play on a phone.
// ---------------------------------------------------------------------------

export function Shell({
  envelope,
  monogram,
  hint,
  music,
  autoplay,
  playLabel,
  pauseLabel,
  children,
}: {
  envelope: boolean;
  monogram: string;
  hint: string;
  music: string;
  autoplay: boolean;
  playLabel: string;
  pauseLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!envelope);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(async () => {
    if (!audio.current) return;
    try {
      await audio.current.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (!audio.current) return;
    if (playing) {
      audio.current.pause();
      setPlaying(false);
    } else void play();
  }, [playing, play]);

  useEffect(() => {
    if (!envelope && music && autoplay) void play();
  }, [envelope, music, autoplay, play]);

  const openEnvelope = () => {
    setOpen(true);
    if (music && autoplay) void play();
  };

  return (
    <>
      {envelope && (
        <div className="inv-envelope" data-open={open} role="button" tabIndex={open ? -1 : 0} aria-hidden={open} onClick={openEnvelope} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openEnvelope()}>
          <div className="inv-envelope-flap">
            <div className="inv-envelope-seal">{monogram || '♥'}</div>
          </div>
          <p className="inv-envelope-hint">{hint}</p>
        </div>
      )}
      {music && (
        <>
          <audio ref={audio} src={music} loop preload="none" />
          <button type="button" className="inv-music no-print" onClick={toggle} aria-label={playing ? pauseLabel : playLabel} title={playing ? pauseLabel : playLabel}>
            {playing ? '❚❚' : '♫'}
          </button>
        </>
      )}
      {children}
    </>
  );
}

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------

export function Countdown({ target, labels, today }: { target: string; labels: [string, string, string, string]; today: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const end = new Date(target).getTime();
  if (now === null) return <div className="inv-count" aria-hidden />;
  const diff = end - now;
  if (diff <= 0) return <p className="text-center text-lg">{today}</p>;
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const cells = [d, h, m, s];
  return (
    <div className="inv-count" role="timer" aria-live="off">
      {cells.map((v, i) => (
        <div key={i}>
          <b>{String(v).padStart(2, '0')}</b>
          <span>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RSVP
// ---------------------------------------------------------------------------

export type RsvpFormProps = {
  slug: string;
  token?: string;
  open: boolean;
  defaultName: string;
  maxSeats: number;
  showSeats: boolean;
  collectAttendees: boolean;
  askDietary: boolean;
  askDepartment: boolean;
  mealChoices: string[];
  existing?: { response: 'ACCEPT' | 'DECLINE'; seats: number; attendees: string[]; mealChoice: string; dietary: string; message: string } | null;
  labels: Record<'name' | 'accept' | 'decline' | 'seats' | 'attendees' | 'meal' | 'dietary' | 'message' | 'phone' | 'submit' | 'update' | 'thanks' | 'closed' | 'seeYou' | 'sorry' | 'department', string>;
};

export function RsvpForm(p: RsvpFormProps) {
  const [response, setResponse] = useState<'ACCEPT' | 'DECLINE'>(p.existing?.response ?? 'ACCEPT');
  const [seats, setSeats] = useState(p.existing?.seats || Math.min(p.maxSeats, 1));
  const [attendees, setAttendees] = useState<string[]>(p.existing?.attendees ?? []);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (!p.open) return <p className="inv-card text-center">{p.labels.closed}</p>;
  if (done) {
    return (
      <div className="inv-card text-center">
        <p className="text-lg">{p.labels.thanks}</p>
        <p className="inv-muted mt-2">{response === 'ACCEPT' ? p.labels.seeYou : p.labels.sorry}</p>
      </div>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const body = {
      slug: p.slug,
      token: p.token,
      name: String(fd.get('name') ?? ''),
      response,
      seats: response === 'ACCEPT' ? seats : 0,
      attendees: attendees.slice(0, seats),
      mealChoice: String(fd.get('mealChoice') ?? ''),
      dietary: String(fd.get('dietary') ?? ''),
      message: String(fd.get('message') ?? ''),
      phone: String(fd.get('phone') ?? ''),
      department: String(fd.get('department') ?? ''),
      website: String(fd.get('website') ?? ''),
    };
    try {
      const res = await fetch('/api/public/rsvp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.');
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const seatOptions = Array.from({ length: p.maxSeats }, (_, i) => i + 1);

  return (
    <form onSubmit={submit} className="inv-card space-y-4" id="rsvp-form">
      <div>
        <label className="inv-label" htmlFor="rsvp-name">{p.labels.name}</label>
        <input id="rsvp-name" name="name" required defaultValue={p.defaultName} className="inv-field" autoComplete="name" />
      </div>

      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        {(['ACCEPT', 'DECLINE'] as const).map((r) => (
          <button key={r} type="button" role="radio" aria-checked={response === r} onClick={() => setResponse(r)} className={`inv-btn ${response === r ? '' : 'inv-btn-outline'}`}>
            {r === 'ACCEPT' ? p.labels.accept : p.labels.decline}
          </button>
        ))}
      </div>

      {response === 'ACCEPT' && p.showSeats && p.maxSeats > 1 && (
        <div>
          <label className="inv-label" htmlFor="rsvp-seats">{p.labels.seats}</label>
          <select id="rsvp-seats" className="inv-field" value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
            {seatOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}

      {response === 'ACCEPT' && p.collectAttendees && seats > 1 && (
        <div>
          <span className="inv-label">{p.labels.attendees}</span>
          <div className="space-y-2">
            {Array.from({ length: seats }, (_, i) => (
              <input key={i} className="inv-field" placeholder={`${i + 1}.`} value={attendees[i] ?? ''} onChange={(e) => setAttendees((a) => { const n = [...a]; n[i] = e.target.value; return n; })} />
            ))}
          </div>
        </div>
      )}

      {response === 'ACCEPT' && p.mealChoices.length > 0 && (
        <div>
          <label className="inv-label" htmlFor="rsvp-meal">{p.labels.meal}</label>
          <select id="rsvp-meal" name="mealChoice" className="inv-field" defaultValue={p.existing?.mealChoice ?? p.mealChoices[0]}>
            {p.mealChoices.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}

      {response === 'ACCEPT' && p.askDietary && (
        <div>
          <label className="inv-label" htmlFor="rsvp-dietary">{p.labels.dietary}</label>
          <input id="rsvp-dietary" name="dietary" className="inv-field" defaultValue={p.existing?.dietary ?? ''} />
        </div>
      )}

      {p.askDepartment && (
        <div>
          <label className="inv-label" htmlFor="rsvp-department">{p.labels.department}</label>
          <input id="rsvp-department" name="department" className="inv-field" />
        </div>
      )}

      <div>
        <label className="inv-label" htmlFor="rsvp-phone">{p.labels.phone}</label>
        <input id="rsvp-phone" name="phone" className="inv-field" inputMode="tel" autoComplete="tel" />
      </div>

      <div>
        <label className="inv-label" htmlFor="rsvp-message">{p.labels.message}</label>
        <textarea id="rsvp-message" name="message" className="inv-field" rows={3} defaultValue={p.existing?.message ?? ''} />
      </div>

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {error && <p role="alert" className="rounded-lg bg-[#fbe9e7] p-2 text-sm text-[#8f1d17]">{error}</p>}

      <button type="submit" className="inv-btn w-full" disabled={busy}>
        {busy ? '…' : p.existing ? p.labels.update : p.labels.submit}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Guestbook
// ---------------------------------------------------------------------------

export function GuestbookForm({ slug, labels }: { slug: string; labels: { name: string; prompt: string; submit: string; pending: string; thanks: string } }) {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'idle' | 'pending' | 'posted'>('idle');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/public/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name: fd.get('name'), message: fd.get('message'), website: fd.get('website') ?? '' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.');
      setState(json.pending ? 'pending' : 'posted');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (state !== 'idle') return <p className="inv-card text-center">{state === 'pending' ? labels.pending : labels.thanks}</p>;

  return (
    <form onSubmit={submit} className="inv-card space-y-3">
      <div>
        <label className="inv-label" htmlFor="gb-name">{labels.name}</label>
        <input id="gb-name" name="name" required className="inv-field" />
      </div>
      <div>
        <label className="inv-label" htmlFor="gb-message">{labels.prompt}</label>
        <textarea id="gb-message" name="message" required rows={3} className="inv-field" />
      </div>
      <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {error && <p role="alert" className="rounded-lg bg-[#fbe9e7] p-2 text-sm text-[#8f1d17]">{error}</p>}
      <button type="submit" className="inv-btn w-full" disabled={busy}>{labels.submit}</button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="inv-btn inv-btn-outline no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}

/**
 * Adding a photo to the shared album. Phone-first: the file input opens the
 * camera roll directly, the chosen photo is previewed from a local object URL
 * so nothing has to travel before the guest can see what they picked, and the
 * form stays on the page afterwards because guests arrive with several photos,
 * not one.
 */
export function GuestPhotoForm({
  slug,
  token,
  labels,
}: {
  slug: string;
  token?: string;
  labels: {
    name: string;
    choose: string;
    caption: string;
    submit: string;
    sending: string;
    pending: string;
    thanks: string;
    another: string;
  };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'pending' | 'posted' | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');

  // An object URL is a document-lifetime resource; without this every photo a
  // guest picks stays in memory until they leave the page.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : '';
    });
    setError('');
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError(labels.choose);
      return;
    }
    fd.set('slug', slug);
    if (token) fd.set('token', token);

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/public/photos', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.');
      setDone(json.pending ? 'pending' : 'posted');
      form.reset();
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return '';
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="inv-card space-y-3 text-center">
        <p>{done === 'pending' ? labels.pending : labels.thanks}</p>
        <button type="button" className="inv-btn inv-btn-outline" onClick={() => setDone(null)}>
          {labels.another}
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} className="inv-card space-y-3">
      <div>
        <label className="inv-label" htmlFor="gp-name">{labels.name}</label>
        <input id="gp-name" name="name" required className="inv-field" autoComplete="name" />
      </div>
      <div>
        <label className="inv-label" htmlFor="gp-file">{labels.choose}</label>
        <input
          id="gp-file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={choose}
          className="inv-field"
        />
      </div>
      {preview && (
        <img src={preview} alt="" className="max-h-56 w-full rounded-xl object-cover" />
      )}
      <div>
        <label className="inv-label" htmlFor="gp-caption">{labels.caption}</label>
        <input id="gp-caption" name="caption" maxLength={280} className="inv-field" />
      </div>
      <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {error && <p role="alert" className="rounded-lg bg-[#fbe9e7] p-2 text-sm text-[#8f1d17]">{error}</p>}
      <button type="submit" className="inv-btn w-full" disabled={busy}>
        {busy ? labels.sending : labels.submit}
      </button>
    </form>
  );
}
