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
  /** Which clip is playing, for its own styling — "capiz" or "universal". */
  clip: string;
  /** The couple's words are set on the clip as it ends (a premium clip, on its card). The Letter carries none. */
  words?: boolean;
  /** The word set between two names on the card — "and", "at" or "&" — the look's, the same as the cover. */
  and?: string;
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
 * Hides the overlay outright when scripts do not run — otherwise a guest with
 * JavaScript off would be left tapping a screen that never opens.
 */
const NO_JS = '.inv-open{display:none !important}';

/** Seconds before a clip's end at which its card is out and the words come up on it. */
const CARD_WORDS_AT = 0.9;
/** How long the card holds with the words on it before the page fades in. */
const CARD_HOLD_MS = 1800;
/** A clip's length when the browser has not said — every clip we ship runs about this long. */
const CLIP_FALLBACK_SECONDS = 4;
/** How long a tapped clip may take to start before the reveal goes on without it. */
const LOAD_GRACE_MS = 8000;
/** How long past a clip's expected end the reveal waits for `ended` before going on without it. */
const END_GRACE_MS = 1500;

/** "Maria & Juan" as the two names and the word between them; anything else as one line. */
function cardNames(names: string, and: string): ReactNode {
  const pair = names.split(' & ');
  if (pair.length !== 2) return names;
  return (
    <>
      {pair[0]}
      <span className="inv-plate-and">{and}</span>
      {pair[1]}
    </>
  );
}

export function Shell({
  opening,
  music,
  startAt = 0,
  playLabel,
  pauseLabel,
  children,
}: {
  opening: OpeningProps;
  /** The background song. It plays on the tap that opens the invitation, and the guest can pause it. */
  music: string;
  /** Seconds into the song it starts from — past a long intro — and returns to when it loops. */
  startAt?: number;
  playLabel: string;
  pauseLabel: string;
  children: ReactNode;
}) {
  const closed = opening.style !== 'none';
  const [open, setOpen] = useState(!closed);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const clip = useRef<HTMLVideoElement | null>(null);
  // The tap has landed: the hint goes, whatever the clip is still doing.
  const [tapped, setTapped] = useState(false);
  // The clip's card is out and the couple's words are on it.
  const [plate, setPlate] = useState(false);
  // The song is taken to its start point once, on the first play; a pause resumes where it was.
  const sought = useRef(false);
  // Whether it got there. A host that serves byte ranges (storage does) takes
  // the seek at once; one that does not makes an early seek land at 0, so the
  // seek is tried again as the file arrives, until it lands or the song has
  // played past the point anyway.
  const landed = useRef(false);

  const seekToStart = useCallback(() => {
    const a = audio.current;
    if (!a || startAt <= 0) return;
    try {
      a.currentTime = startAt;
    } catch {
      /* nothing loaded yet: settle() tries again as it loads */
    }
  }, [startAt]);

  const settle = useCallback(() => {
    const a = audio.current;
    if (!a || startAt <= 0 || !sought.current || landed.current) return;
    if (a.currentTime >= startAt - 0.25) {
      landed.current = true;
      return;
    }
    const ranges = a.seekable;
    if (ranges.length && ranges.end(ranges.length - 1) >= startAt) seekToStart();
  }, [startAt, seekToStart]);

  const play = useCallback(async () => {
    if (!audio.current) return;
    if (!sought.current) {
      sought.current = true;
      seekToStart();
    }
    try {
      await audio.current.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [seekToStart]);

  const toggle = useCallback(() => {
    if (!audio.current) return;
    if (playing) {
      audio.current.pause();
      setPlaying(false);
    } else void play();
  }, [playing, play]);

  useEffect(() => {
    if (!closed && music) void play();
  }, [closed, music, play]);

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
    if (music) void play();
    const video = clip.current;
    if (opening.style !== 'cinematic' || !video) {
      setOpen(true);
      return;
    }
    // The card the clip opens onto is blank in the file: on a clip that sets
    // the couple's words on it, they come up as the card settles, stay long
    // enough to read, and then the page fades in over them. On any other clip
    // the page comes up as the clip reaches its last moments, with no hold on
    // an empty card.
    const words = Boolean(opening.words);
    let done = false;
    let ending = false;
    const finish = () => {
      if (done) return;
      done = true;
      setOpen(true);
    };
    // The words are never skipped. Whatever the clip does — plays to the end,
    // stalls, refuses, or is left out for a guest who asked for less motion —
    // they come up, hold to be read, and then the page fades in.
    const close = () => {
      if (done || ending) return;
      ending = true;
      if (!words) return finish();
      setPlate(true);
      window.setTimeout(finish, CARD_HOLD_MS);
    };
    // A guest who asked for less motion gets the poster — the same artwork,
    // standing still — with the words on it, and the fade. The clip never plays.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      close();
      return;
    }
    const onTime = () => {
      if (!video.duration) return;
      const left = video.duration - video.currentTime;
      if (words) {
        if (left <= CARD_WORDS_AT) setPlate(true);
        return;
      }
      if (left <= 0.6) {
        video.removeEventListener('timeupdate', onTime);
        finish();
      }
    };
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('ended', close, { once: true });
    // A clip that will not play — an unsupported codec, a file that 404s, a
    // browser that refuses — must not strand the guest on a screen that never
    // opens, so the reveal happens anyway, words first.
    video.addEventListener('error', close, { once: true });
    // A second clock beside the clip's own events, because a phone can play a
    // clip and still be stingy with them: from the moment it actually starts,
    // the words are due at the clip's last stretch and the reveal is due just
    // past its end. A clip that never starts is given up on after a grace.
    let started = false;
    const loadGuard = window.setTimeout(() => {
      if (!started) close();
    }, LOAD_GRACE_MS);
    video.addEventListener(
      'playing',
      () => {
        if (started) return;
        started = true;
        window.clearTimeout(loadGuard);
        const expected = (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : CLIP_FALLBACK_SECONDS) * 1000;
        if (words) window.setTimeout(() => setPlate(true), Math.max(0, expected - CARD_WORDS_AT * 1000));
        window.setTimeout(close, expected + END_GRACE_MS);
      },
      { once: true },
    );
    void video.play().catch(close);
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
            </div>
            {opening.words && (
              <div className="inv-open-plate" data-show={plate} aria-hidden>
                <div>
                  {opening.monogram && <p className="inv-plate-mono">{opening.monogram}</p>}
                  {opening.line && <p className="inv-plate-eyebrow">{opening.line}</p>}
                  {opening.names && <p className="inv-plate-names">{cardNames(opening.names, opening.and || '&')}</p>}
                  {opening.date && <p className="inv-plate-date">{opening.date}</p>}
                  {opening.line2 && <p className="inv-plate-line2">{opening.line2}</p>}
                </div>
              </div>
            )}
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
          {/* no `loop`: the song returns to its start point, not to the beginning */}
          <audio
            ref={audio}
            src={music}
            preload="none"
            onLoadedMetadata={settle}
            onCanPlay={settle}
            onProgress={settle}
            onPlaying={settle}
            onSeeked={settle}
            onEnded={() => {
              landed.current = false;
              seekToStart();
              void audio.current?.play();
            }}
          />
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
  groups: string[];
  existing?: { response: 'ACCEPT' | 'DECLINE'; seats: number; attendees: string[]; mealChoice: string; dietary: string; message: string; groupName: string } | null;
  labels: Record<'name' | 'accept' | 'decline' | 'seats' | 'companions' | 'companion' | 'meal' | 'dietary' | 'message' | 'phone' | 'submit' | 'update' | 'thanks' | 'closed' | 'seeYou' | 'sorry' | 'department' | 'group', string>;
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
      groupName: String(fd.get('groupName') ?? ''),
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

      {p.groups.length > 0 && (
        <div>
          <label className="inv-label" htmlFor="rsvp-group">{p.labels.group}</label>
          <select id="rsvp-group" name="groupName" className="inv-field" defaultValue={p.existing?.groupName ?? ''}>
            <option value=""></option>
            {p.groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      )}

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
/**
 * Two ways to lay the ground. By number: the backgrounds in `order`, one per
 * page, `last` under the final page (Capiz). By page: each page names its
 * ground in `data-bg` and `grounds` gives that ground's file and its height as
 * a multiple of the width (Baby Blue). `seam` is how far one ground dissolves
 * into the next, as a share of the width — longer where the tones differ.
 */
type Ground = { url: string; ratio: number; top: string; bottom: string; slices?: { top: string; foot: string; mid: string } };
export function PageGround({ ratio, order, last, backgrounds, night, grounds, seam: seamShare = 0.24 }: { ratio: number; order: number[]; last: number; backgrounds: string[]; night?: string[]; grounds?: Record<string, Ground>; seam?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const inv = ref.current?.closest<HTMLElement>('.inv');
    const ground = inv?.querySelector<HTMLElement>('.inv-ground');
    if (!inv || !ground) return;
    const pages = Array.from(inv.querySelectorAll<HTMLElement>('.inv-page'));
    let frame = 0;
    const lay = () => {
      const width = inv.clientWidth;
      if (!width || !pages.length) return;
      const invTop = inv.getBoundingClientRect().top;
      // how far the ground before dissolves into this page: the layout's share
      // of the width, or the page's own (a drawn page keeps its top clear)
      const seamOf = (p: HTMLElement) => Math.round(width * (p.dataset.seam ? Number(p.dataset.seam) : seamShare));
      // A join is the page before dissolving out over the page after, which is
      // laid beneath it and starts early, so the page after never shows a cut
      // top edge and the page before never a cut foot: it is transparent by
      // the time its picture ends. Where the join sits relative to the page's
      // top edge depends on what is drawn there. A page whose ground is its
      // own picture starts that picture half a seam up, inside the page
      // before, so the two pictures cross halfway across the join. A drawn
      // page cannot move its ground — its frames and writings sit at fixed
      // places on it — so the ground begins at its top edge and the join lies
      // wholly below it, short, to keep its header clear; and the page after a
      // drawn page joins wholly above its own top edge, short, so the drawn
      // page's foot is not dissolved under its last frame. Pages by number
      // keep the split half and half.
      const drawnOut = Math.round(width * 0.2);
      const joinOf = (p: HTMLElement, before: HTMLElement | undefined, seam: number): { above: number; below: number } => {
        if (p.hasAttribute('data-drawn')) return { above: 0, below: seam };
        if (before?.hasAttribute('data-drawn')) return { above: drawnOut, below: 0 };
        return { above: Math.round(seam / 2), below: seam - Math.round(seam / 2) };
      };
      // the background by number — by night, the night one where the design has it
      const dark = inv.dataset.mode === 'night' && Boolean(night?.length);
      const byNumber = (n: number) => (dark ? night?.[(n - 1) % backgrounds.length] : '') || backgrounds[(n - 1) % backgrounds.length];
      const segs: { url: string; bg: number; top: number; height: number; foot: boolean; above: number; below: number; own?: Ground }[] = [];
      let k = 0;
      pages.forEach((p, i) => {
        const r = p.getBoundingClientRect();
        const top = r.top - invTop;
        const lastPage = i === pages.length - 1;
        const own = grounds && p.dataset.bg ? grounds[p.dataset.bg] : undefined;
        const bg = width * (own ? own.ratio : ratio);
        if (!bg) return;
        const seam = seamOf(p);
        const join = joinOf(p, pages[i - 1], seam);
        // A page with a ground of its own always sits on that one ground,
        // whatever its height. By number: a page up to a tenth taller than one
        // background (with the seam it reaches into) stays on one, drawn a
        // little larger; a longer page is split evenly over as many as it
        // needs, each trimmed to its share.
        const count = own ? 1 : Math.max(1, Math.ceil((r.height + seam) / (bg * 1.1)));
        const share = r.height / count;
        for (let j = 0; j < count; j++) {
          const foot = lastPage && j === count - 1;
          const url = own ? own.url : byNumber(foot ? last : order[Math.min(k++, order.length - 1)]);
          // a page split over several backgrounds joins itself half and half
          const half = Math.round(seam / 2);
          segs.push({ url, bg, top: top + j * share, height: share, foot, above: j === 0 ? join.above : half, below: j === 0 ? join.below : seam - half, own });
        }
      });
      // The papers to draw: one per segment, and under a page shorter than its
      // own ground, a second that brings the ground's foot in beneath the words.
      // Earlier papers lie on top of later ones, and every paper but the last
      // dissolves out across its foot (`out`) — over the next paper, which
      // starts that far up, opaque. A foot paper also fades in at its top
      // (`seam`), over its own page's ground.
      const papers: { className: string; top: number; height: number; seam: number; out: number; z: number; draw: (el: HTMLElement) => void }[] = [];
      segs.forEach((s, i) => {
        const first = i === 0;
        const final = i === segs.length - 1;
        // starts its share of the join up inside the page before, and reaches
        // the next join's foot, dissolving out across it
        const half = first ? 0 : s.above;
        const nextHalf = final ? 0 : segs[i + 1].below;
        const out = final ? 0 : segs[i + 1].above + segs[i + 1].below;
        const top = first ? s.top : s.top - half;
        const bottom = final ? inv.scrollHeight : s.top + s.height + nextHalf;
        const box = bottom - top;
        const z = 2 * (segs.length - i);
        const g = s.own;
        const bgH = Math.round(s.bg);
        if (g && g.slices && s.height < bgH * 0.96) {
          // shorter than its ground: the foot of the picture comes in under the
          // words, fading up from nothing, so the page ends the way the ground
          // does; it runs to the paper's foot, so the join never cuts it
          const footH = Math.round(g.ratio * width * 0.44);
          const shown = Math.min(footH, Math.round(s.height * 0.55));
          const foot = g.slices.foot;
          papers.push({ className: 'inv-paper is-foot-art', top: s.top + s.height - shown, height: shown + nextHalf, seam: Math.round(shown * 0.7), out, z: z + 1, draw: (el) => {
            el.style.backgroundImage = `url("${foot}")`;
            el.style.backgroundSize = '100% auto';
            el.style.backgroundPosition = 'center bottom';
            el.style.backgroundRepeat = 'no-repeat';
          } });
        }
        papers.splice(papers.length - (g && g.slices && s.height < bgH * 0.96 ? 1 : 0), 0, { className: `inv-paper${first ? ' is-first' : ''}${s.foot && !s.own ? ' is-foot' : ''}`, top, height: box, seam: 0, out, z, draw: (el) => {
        if (s.own) {
          // A ground of the page's own, laid from the paper's top: for most
          // pages that is half a seam up inside the page before, so the picture
          // crosses into the one before it; for a drawn page it is the page's
          // own top edge. A page no taller than the ground shows it whole, its
          // edge colours filling the strips beyond; a taller page keeps the
          // ground's head and foot whole and stretches the band between.
          const g = s.own;
          const bgH = Math.round(s.bg);
          const startY = 0;
          const tall = s.height + half > bgH * 1.02;
          if (tall && g.slices) {
            // the foot slice runs to the paper's foot, so the join never cuts it
            el.style.backgroundImage = `url("${g.slices.top}"), url("${g.slices.foot}"), url("${g.slices.mid}")`;
            el.style.backgroundSize = '100% auto, 100% auto, 100% 100%';
            el.style.backgroundPosition = `center ${startY}px, center bottom, center top`;
          } else {
            el.style.backgroundImage = `url("${g.url}"), linear-gradient(to bottom, ${g.top} 0, ${g.top} ${startY}px, ${g.bottom} ${startY + bgH}px, ${g.bottom} 100%)`;
            el.style.backgroundSize = `${tall ? `auto ${Math.round(s.height + half)}px` : '100% auto'}, 100% 100%`;
            el.style.backgroundPosition = `center ${startY}px, center top`;
          }
          el.style.backgroundRepeat = 'no-repeat';
        } else {
          // taller than its background: drawn to the box's height, the sides trimmed
          el.style.backgroundSize = box > s.bg ? 'auto 100%' : '100% auto';
          el.style.backgroundPosition = '';
          el.style.backgroundRepeat = '';
          const src = `url("${s.url}")`;
          if (el.style.backgroundImage !== src) el.style.backgroundImage = src;
        }
        } });
      });
      while (ground.children.length > papers.length) ground.lastElementChild?.remove();
      papers.forEach((pp, i) => {
        let el = ground.children[i] as HTMLElement | undefined;
        if (!el) {
          el = document.createElement('div');
          ground.appendChild(el);
        }
        el.className = pp.className;
        el.style.top = `${Math.round(pp.top)}px`;
        el.style.height = `${Math.round(pp.height)}px`;
        el.style.zIndex = String(pp.z);
        el.style.setProperty('--seam', `${pp.seam}px`);
        el.style.setProperty('--out', `${pp.out}px`);
        pp.draw(el);
      });
      ground.toggleAttribute('data-night-art', dark);
    };
    const queue = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(lay); };
    queue();
    const ro = new ResizeObserver(queue);
    ro.observe(inv);
    for (const p of pages) ro.observe(p);
    // day to night and back: the papers change
    const mo = new MutationObserver(queue);
    mo.observe(inv, { attributes: true, attributeFilter: ['data-mode'] });
    window.addEventListener('load', queue);
    document.fonts?.ready.then(queue).catch(() => {});
    return () => { cancelAnimationFrame(frame); ro.disconnect(); mo.disconnect(); window.removeEventListener('load', queue); };
  }, [ratio, order, last, backgrounds, night, grounds, seamShare]);
  return <span ref={ref} hidden />;
}

/**
 * Day and night. The couple sets how the page opens — day, night, or by the
 * guest's clock (night from six in the evening to six in the morning) — and
 * the guest may switch with this button; their choice is kept on their phone
 * for this invitation. The mode is an attribute on the page, which the CSS
 * and the ground both read.
 */
export function ModeToggle({ mode, slug, dayLabel, nightLabel }: { mode: string; slug: string; dayLabel: string; nightLabel: string }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [night, setNight] = useState(mode === 'night');
  const key = `inv-mode:${slug}`;
  useEffect(() => {
    const inv = ref.current?.closest<HTMLElement>('.inv');
    if (!inv) return;
    let want = mode === 'night';
    try {
      const saved = localStorage.getItem(key);
      if (saved === 'day' || saved === 'night') want = saved === 'night';
      else if (mode === 'auto') {
        const h = new Date().getHours();
        want = h >= 18 || h < 6;
      }
    } catch {
      // storage refused: the couple's setting stands
    }
    inv.dataset.mode = want ? 'night' : 'day';
    setNight(want);
  }, [mode, key]);
  const flip = () => {
    const inv = ref.current?.closest<HTMLElement>('.inv');
    if (!inv) return;
    const next = !night;
    inv.dataset.mode = next ? 'night' : 'day';
    setNight(next);
    try {
      localStorage.setItem(key, next ? 'night' : 'day');
    } catch {
      // storage refused: the switch still holds for this visit
    }
  };
  return (
    <button ref={ref} type="button" className="inv-mode no-print" onClick={flip} aria-label={night ? dayLabel : nightLabel} title={night ? dayLabel : nightLabel}>
      {night ? '☀' : '☾'}
    </button>
  );
}
