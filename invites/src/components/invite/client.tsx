'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The interactive parts of a guest page. Everything else renders on the
 * server. Each of these degrades: without JavaScript the opening removes
 * itself (see the noscript rule below), the countdown shows the date, and the
 * forms post nowhere — so the forms below are the only thing a guest cannot
 * do without it, which is why the RSVP-by-text number is printed beside them.
 */

// ---------------------------------------------------------------------------
// The opening + music. One component, because the tap that opens the
// invitation is the user gesture that lets audio play on a phone.
//
// Every opening is the same overlay with a different stage inside it and a
// different exit in CSS. Nothing here downloads a video: the couple's own
// words and photos are what move, which is why a name change needs no
// re-rendering and a guest on mobile data waits for nothing.
// ---------------------------------------------------------------------------

export type OpeningProps = {
  /** An OpeningKey. "none" renders nothing at all. */
  style: string;
  monogram: string;
  names: string;
  /** "08 · 24 · 26" — already formatted by the server. */
  date: string;
  /** The one line on the closed screen. */
  line: string;
  /** Shown while the opening plays. Blank shows nothing. */
  line2: string;
  /** Letterspaced caps instead of the script face. */
  caps: boolean;
  /** Up to three, in the order the stage wants them. */
  photos: string[];
  /** "cinematic" only: the clip, and the still shown until it plays. */
  video: string;
  poster: string;
  /** Which clip, when the words belong on its card rather than over its face — "capiz". */
  clip: string;
  /** "Tap to open". */
  hint: string;
};

function Stage({ style, monogram, photos, video, poster, videoRef }: {
  style: string;
  monogram: string;
  photos: string[];
  video: string;
  poster: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  switch (style) {
    case 'cinematic':
      // The poster carries the whole closed screen, so the guest sees the
      // artwork immediately and the clip is only fetched when they tap —
      // preload="none" is what keeps the first paint free of it.
      return (
        <video
          ref={videoRef}
          className="inv-open-clip"
          src={video}
          poster={poster}
          muted
          playsInline
          preload="none"
          aria-hidden
        />
      );
    case 'envelope':
    case 'seal':
      return (
        <span className="inv-open-env" aria-hidden>
          <span className="inv-open-card" />
          <span className="inv-open-flap" />
          <span className="inv-open-wax">{monogram || '♥'}</span>
        </span>
      );
    case 'drape':
      return <span className="inv-open-drape" aria-hidden />;
    case 'curtain':
      return (
        <span className="inv-open-scene" aria-hidden>
          {photos[0] && <img className="inv-open-back" src={photos[0]} alt="" />}
          <span className="inv-open-panel" data-side="l" />
          <span className="inv-open-panel" data-side="r" />
        </span>
      );
    case 'photo':
      return (
        <span className="inv-open-fan" aria-hidden>
          {photos.slice(0, 3).map((src, i) => (
            <span key={src + i} className="inv-open-shot" data-i={i}>
              <img src={src} alt="" />
            </span>
          ))}
        </span>
      );
    case 'line':
      return (
        <svg className="inv-open-curve" viewBox="0 0 320 110" fill="none" aria-hidden>
          <path d="M8 88 C 84 12, 236 12, 312 88" stroke="var(--inv-accent2)" strokeWidth="1.5" strokeLinecap="round" pathLength={1} />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * The couple's words on the card a clip opens onto: monogram, the line,
 * the names, the date. Set in a box the size of the clip's own frame, so they
 * land on the card whatever the screen's shape. "Juan & Maria" is set as two
 * names with an "and" between, the way a card is lettered.
 */
function CardWords({ opening, show }: { opening: OpeningProps; show: boolean }) {
  const names = opening.names.split(/\s+&\s+/);
  return (
    <div className="inv-open-plate" data-show={show} aria-hidden>
      <div>
        {opening.monogram && <p className="inv-plate-mono">{opening.monogram}</p>}
        {opening.line && <p className="inv-plate-eyebrow">{opening.line}</p>}
        {opening.names && (
          <p className="inv-plate-names">
            {names.map((n, i) => (
              <span key={i}>
                {i > 0 && <span className="inv-plate-and">and</span>}
                {n}
              </span>
            ))}
          </p>
        )}
        {opening.date && <p className="inv-plate-date">{opening.date}</p>}
        {opening.line2 && <p className="inv-plate-line2">{opening.line2}</p>}
      </div>
    </div>
  );
}

/**
 * Hides the overlay outright when scripts do not run — otherwise a guest with
 * JavaScript off would be left tapping a screen that never opens.
 */
const NO_JS = '.inv-open{display:none !important}';

export function Shell({
  opening,
  music,
  autoplay,
  playLabel,
  pauseLabel,
  children,
}: {
  opening: OpeningProps;
  music: string;
  autoplay: boolean;
  playLabel: string;
  pauseLabel: string;
  children: ReactNode;
}) {
  const closed = opening.style !== 'none';
  const [open, setOpen] = useState(!closed);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const clip = useRef<HTMLVideoElement | null>(null);
  // The words on the card, once the clip has opened onto it.
  const [card, setCard] = useState(false);
  // The tap has landed: the hint goes, whatever the clip is still doing.
  const [tapped, setTapped] = useState(false);

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
    if (!closed && music && autoplay) void play();
  }, [closed, music, autoplay, play]);

  // The page behind must not scroll under the overlay — on a phone a stray
  // swipe would otherwise scroll the invitation past the opening unseen.
  useEffect(() => {
    if (open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /**
   * The tap. For every drawn opening the CSS exit runs and the overlay is gone
   * on a timer; the cinematic one instead plays its clip and leaves when the
   * clip ends, because the reveal *is* the clip.
   *
   * The tap is also what makes both of these work at all on a phone: playing
   * video or audio without a user gesture is blocked, and this is the gesture.
   */
  const reveal = () => {
    setTapped(true);
    if (music && autoplay) void play();
    const video = clip.current;
    if (opening.style !== 'cinematic' || !video) {
      setOpen(true);
      return;
    }
    // A guest who asked for less motion gets the poster — the same artwork,
    // standing still — and a plain fade when they tap. The clip never plays.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setOpen(true);
      return;
    }
    // A clip whose card carries the words holds on its last frame long enough
    // for them to be read before the page comes up behind it.
    const finish = () => setOpen(true);
    const ended = () => (opening.clip ? setTimeout(finish, 1500) : finish());
    video.addEventListener('ended', ended, { once: true });
    if (opening.clip) {
      // The card is clear of the panels from about here; the words fade in on it.
      const at = 2.7;
      const onTime = () => {
        if (video.currentTime >= at) {
          setCard(true);
          video.removeEventListener('timeupdate', onTime);
        }
      };
      video.addEventListener('timeupdate', onTime);
      setTimeout(() => setCard(true), (at + 0.35) * 1000);
    }
    // A clip that will not play — an unsupported codec, a file that 404s, a
    // browser that refuses — must not strand the guest on a screen that never
    // opens, so the reveal happens anyway.
    video.addEventListener('error', finish, { once: true });
    void video.play().catch(finish);
  };

  return (
    <>
      {closed && (
        <>
          <noscript><style>{NO_JS}</style></noscript>
          <div
            className="inv-open"
            data-style={opening.style}
            data-clip={opening.clip || undefined}
            data-open={open}
            data-tapped={tapped}
            role="button"
            tabIndex={open ? -1 : 0}
            aria-label={opening.hint}
            aria-hidden={open}
            onClick={reveal}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && reveal()}
          >
            <div className="inv-open-stage">
              <Stage style={opening.style} monogram={opening.monogram} photos={opening.photos} video={opening.video} poster={opening.poster} videoRef={clip} />
              {opening.clip && <CardWords opening={opening} show={card} />}
            </div>
            <div className="inv-open-copy">
              {opening.line && <p className="inv-open-line" data-caps={opening.caps}>{opening.line}</p>}
              {opening.line2 && <p className="inv-open-line2">{opening.line2}</p>}
              {opening.names && <p className="inv-open-names">{opening.names}</p>}
              {opening.date && <p className="inv-open-date">{opening.date}</p>}
            </div>
            <p className="inv-open-hint">{opening.hint}</p>
          </div>
        </>
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
  labels: Record<'name' | 'accept' | 'decline' | 'seats' | 'companions' | 'companion' | 'meal' | 'dietary' | 'message' | 'phone' | 'submit' | 'update' | 'thanks' | 'closed' | 'seeYou' | 'sorry' | 'department', string>;
};

export function RsvpForm(p: RsvpFormProps) {
  const [response, setResponse] = useState<'ACCEPT' | 'DECLINE'>(p.existing?.response ?? 'ACCEPT');
  const [seats, setSeats] = useState(p.existing?.seats || Math.min(p.maxSeats, 1));
  // The people the guest is bringing. What is saved is the whole party, the
  // guest first, so an earlier answer is read back without their own name.
  const [companions, setCompanions] = useState<string[]>(() => {
    const saved = p.existing?.attendees ?? [];
    return saved[0] && saved[0] === p.defaultName ? saved.slice(1) : saved;
  });
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
      attendees: response === 'ACCEPT' && seats > 1 ? [String(fd.get('name') ?? ''), ...companions.slice(0, seats - 1)] : [],
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
          <span className="inv-label">{p.labels.companions}</span>
          <div className="space-y-2">
            {Array.from({ length: seats - 1 }, (_, i) => (
              <input key={i} className="inv-field" placeholder={p.labels.companion.replace('{n}', String(i + 1))} value={companions[i] ?? ''} autoComplete="off" onChange={(e) => setCompanions((a) => { const n = [...a]; n[i] = e.target.value; return n; })} />
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

/**
 * The film, shown as its poster with the title written over it until the guest
 * taps; then the player takes its place and starts. The poster is the video's
 * own still when the host offers one, else one of the couple's photographs.
 */
export function VideoFacade({ src, poster, fallback, title, cta, label }: { src: string; poster: string; fallback: string; title: string; cta: string; label: string }) {
  const [on, setOn] = useState(false);
  if (on) {
    const url = `${src}${src.includes('?') ? '&' : '?'}autoplay=1`;
    return <iframe src={url} title={label} className="inv-video-frame" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />;
  }
  return (
    <button type="button" className="inv-video-facade" onClick={() => setOn(true)} aria-label={label}>
      {poster && (
        <img
          src={poster}
          alt=""
          loading="lazy"
          onError={(e) => {
            if (fallback && e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
            else e.currentTarget.hidden = true;
          }}
        />
      )}
      <span className="inv-video-play" aria-hidden="true" />
      {title && <span className="inv-video-title">{title}</span>}
      {cta && <span className="inv-video-cta">{cta}</span>}
    </button>
  );
}

/**
 * The Capiz ground, laid to the pages: behind each page its background, in
 * order, trimmed to the page's own height — a page longer than one background
 * carries on into the next. Where a background begins it dissolves in over the
 * foot of the one before (a quarter of the width, half above the join and half
 * below), so no edge shows; the last is anchored at its foot, so the invitation
 * ends on the bottom of the background drawn last. The backgrounds' height
 * follows the column's width, so this is measured, not styled, and runs again
 * whenever the column or a page changes size.
 */
export function PageGround({ ratio, order, last }: { ratio: number; order: number[]; last: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const inv = ref.current?.closest<HTMLElement>('.inv');
    const ground = inv?.querySelector<HTMLElement>('.inv-ground');
    if (!inv || !ground) return;
    const pages = Array.from(inv.querySelectorAll<HTMLElement>('.inv-page'));
    let frame = 0;
    const lay = () => {
      const width = inv.clientWidth;
      const bg = width * ratio;
      if (!bg || !pages.length) return;
      const seam = Math.round(width * 0.24);
      const half = Math.round(seam / 2);
      const invTop = inv.getBoundingClientRect().top;
      const segs: { n: number; top: number; height: number; foot: boolean }[] = [];
      let k = 0;
      pages.forEach((p, i) => {
        const r = p.getBoundingClientRect();
        const top = r.top - invTop;
        const lastPage = i === pages.length - 1;
        // A page up to a tenth taller than one background (with the seam it
        // reaches into) stays on one, drawn a little larger; a longer page is
        // split evenly over as many as it needs, each trimmed to its share.
        const count = Math.max(1, Math.ceil((r.height + seam) / (bg * 1.1)));
        const share = r.height / count;
        for (let j = 0; j < count; j++) {
          const foot = lastPage && j === count - 1;
          segs.push({ n: foot ? last : order[Math.min(k++, order.length - 1)], top: top + j * share, height: share, foot });
        }
      });
      while (ground.children.length > segs.length) ground.lastElementChild?.remove();
      segs.forEach((s, i) => {
        let el = ground.children[i] as HTMLElement | undefined;
        if (!el) {
          el = document.createElement('div');
          ground.appendChild(el);
        }
        const first = i === 0;
        const final = i === segs.length - 1;
        // reaches half a seam up into the page before and half a seam down under the next
        const top = first ? s.top : s.top - half;
        const bottom = final ? inv.scrollHeight : s.top + s.height + half;
        const box = bottom - top;
        el.className = `inv-paper${first ? ' is-first' : ''}${s.foot ? ' is-foot' : ''}`;
        el.style.top = `${Math.round(top)}px`;
        el.style.height = `${Math.round(box)}px`;
        // taller than its background: drawn to the box's height, the sides trimmed
        el.style.backgroundSize = box > bg ? 'auto 100%' : '100% auto';
        el.style.setProperty('--seam', `${seam}px`);
        const src = `url(/capiz/bg-${s.n}.webp)`;
        if (el.style.backgroundImage !== src) el.style.backgroundImage = src;
      });
    };
    const queue = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(lay); };
    queue();
    const ro = new ResizeObserver(queue);
    ro.observe(inv);
    for (const p of pages) ro.observe(p);
    window.addEventListener('load', queue);
    document.fonts?.ready.then(queue).catch(() => {});
    return () => { cancelAnimationFrame(frame); ro.disconnect(); window.removeEventListener('load', queue); };
  }, [ratio, order, last]);
  return <span ref={ref} hidden />;
}
