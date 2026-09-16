'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { plateChars } from '@/lib/openings';
import { Scene, useMomentGesture } from './moments';
import { MOMENT_BY_KEY, SPEED_FACTOR, type MomentKey, type Speed, type Trigger } from '@/lib/moments';
import { PHOTOS_AT_ONCE } from '@/lib/album';
import type { Attendee } from '@/lib/attendees';

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
  /** the design's own photographed parts for the scene, by PartKey; the shipped set otherwise */
  parts?: Record<string, string>;
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
  /** the opening's pace: the same motion, slower or quicker */
  speed?: Speed;
  /** how the guest opens it, where the opening takes more than one way */
  trigger?: Trigger;
};

/** The scene an opening plays, where it is one of the moments' — the envelope and the seal are, since #174. */
const SCENE_OF: Partial<Record<string, MomentKey>> = { envelope: 'envelope', seal: 'seal', ribbon: 'ribbon', doors: 'doors', capiz: 'capiz', letter: 'letter' };

function Stage({ style, monogram, photos, video, poster, videoRef, parts }: {
  style: string;
  monogram: string;
  photos: string[];
  parts?: Record<string, string>;
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
    case 'ribbon':
    case 'doors':
    case 'capiz':
    case 'letter':
      // the same scene a moment on a page plays, filling the screen
      return <Scene scene={SCENE_OF[style]!} photos={photos} monogram={monogram} parts={parts} />;
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
  // how it is opened: the trigger the invitation chose where the scene takes it, else the scene's own; a tap for the openings that are not scenes
  const scene = SCENE_OF[opening.style];
  const sceneDef = scene ? MOMENT_BY_KEY[scene] : undefined;
  const trigger: Trigger = sceneDef && opening.trigger && sceneDef.triggers.includes(opening.trigger) ? opening.trigger : sceneDef?.triggers[0] ?? 'tap';
  const speed: Speed = opening.speed ?? 'normal';
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const clip = useRef<HTMLVideoElement | null>(null);
  // The tap has landed: the hint goes, whatever the clip is still doing.
  const [tapped, setTapped] = useState(false);
  // The clip's card is out and the couple's words are on it.
  const [plate, setPlate] = useState(false);
  /**
   * The clip never ran, so the words are going on a card drawn in the design's
   * own colours instead of on the poster.
   *
   * The poster is the clip's first frame and both of ours carry their own
   * writing baked into the artwork — the Capiz seal reads YOU'RE INVITED, the
   * bow's tag says it too — so the couple's card printed over it comes out as
   * a double exposure, their names crossing the wax seal. The gallery's
   * preview solves it the same way (.gal-still).
   */
  const [still, setStill] = useState(false);
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
  const gesture = useMomentGesture({ trigger, speed, duration: sceneDef?.duration ?? 1200, swipe: sceneDef?.swipe, disabled: open, onOpen: () => revealNow() });
  const reveal = () => {
    if (trigger !== 'tap') return; // a swipe or a hold arrives through the gesture, never through a click
    revealNow();
  };
  const revealNow = () => {
    if (tapped) return;
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
      // the clip is at its end only if it actually ran; anything else puts the
      // words on the design's own card rather than over the poster's artwork
      if (video.currentTime < 0.1) setStill(true);
      setPlate(true);
      window.setTimeout(finish, CARD_HOLD_MS);
    };
    // A guest who asked for less motion gets the words on the design's own card
    // and the fade, with no clip and nothing moving.
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
            data-state={open || tapped ? 'open' : 'closed'}
            data-trigger={trigger}
            data-dragging={gesture.dragging ? '' : undefined}
            data-tapped={tapped}
            data-still={still || undefined}
            style={{ ['--moment-t' as string]: String(SPEED_FACTOR[speed]), ['--open-drag' as string]: gesture.drag.toFixed(3) }}
            role="button"
            tabIndex={open ? -1 : 0}
            aria-label={opening.hint}
            aria-hidden={open}
            onClick={reveal}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && revealNow()}
            onPointerDown={gesture.handlers.onPointerDown}
            onPointerMove={gesture.handlers.onPointerMove}
            onPointerUp={gesture.handlers.onPointerUp}
            onPointerCancel={gesture.handlers.onPointerCancel}
          >
            <div className="inv-open-stage">
              <Stage style={opening.style} monogram={opening.monogram} photos={opening.photos} video={opening.video} poster={opening.poster} videoRef={clip} parts={opening.parts} />
            </div>
            {/* the card the words go on when the clip could not play */}
            {opening.words && <div className="inv-open-still" data-show={still} aria-hidden />}
            {opening.words && (
              <div className="inv-open-plate" data-show={plate} aria-hidden>
                <div>
                  {opening.monogram && <p className="inv-plate-mono">{opening.monogram}</p>}
                  {opening.line && <p className="inv-plate-eyebrow">{opening.line}</p>}
                  {opening.names && <p className="inv-plate-names" style={{ ['--plate-chars' as string]: plateChars(opening.names.split(' & ')) }}>{cardNames(opening.names, opening.and || '&')}</p>}
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
  /**
   * What the couple recorded for this guest on their guest list, shown as the
   * starting answer so a guest is not asked something we already know. Only
   * honoured when it is one of `groups`: the select can only show an option it
   * has, and a tag the couple never offered is dropped server-side anyway —
   * where it falls back to this same value, so nothing is lost by leaving the
   * field blank here.
   */
  defaultGroup?: string;
  existing?: { response: 'ACCEPT' | 'DECLINE'; seats: number; attendees: Attendee[]; mealChoice: string; dietary: string; message: string; groupName: string; phone: string; email: string } | null;
  labels: Record<'name' | 'accept' | 'decline' | 'seats' | 'companions' | 'companion' | 'meal' | 'dietary' | 'message' | 'phone' | 'submit' | 'update' | 'thanks' | 'closed' | 'seeYou' | 'sorry' | 'department' | 'group' | 'relation' | 'relationBlank' | 'relationName' | 'email' | 'phoneHint' | 'emailHint', string>;
  /** The relationships on offer, already in the guest's language. */
  relations: { value: string; label: string }[];
};

export function RsvpForm(p: RsvpFormProps) {
  const [response, setResponse] = useState<'ACCEPT' | 'DECLINE'>(p.existing?.response ?? 'ACCEPT');
  const [seats, setSeats] = useState(p.existing?.seats || Math.min(p.maxSeats, 1));
  // The people the guest is bringing. What is saved is the whole party, the
  // guest first, so an earlier answer is read back without their own name.
  const [companions, setCompanions] = useState<Attendee[]>(() => {
    const saved = p.existing?.attendees ?? [];
    return saved[0] && saved[0].name === p.defaultName ? saved.slice(1) : saved;
  });
  const setCompanion = (i: number, patch: Partial<Attendee>) =>
    setCompanions((a) => {
      const n = [...a];
      n[i] = { ...{ name: '', relation: '' }, ...n[i], ...patch };
      return n;
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
      // The guest heads their own party and is nobody's plus one, so they go in
      // without a relationship; the rest carry what was picked beside the name.
      attendees:
        response === 'ACCEPT' && seats > 1
          ? [{ name: String(fd.get('name') ?? ''), relation: '' }, ...companions.slice(0, seats - 1).filter((c) => c.name.trim())]
          : [],
      groupName: String(fd.get('groupName') ?? ''),
      mealChoice: String(fd.get('mealChoice') ?? ''),
      dietary: String(fd.get('dietary') ?? ''),
      message: String(fd.get('message') ?? ''),
      phone: String(fd.get('phone') ?? ''),
      email: String(fd.get('email') ?? ''),
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
  // An answer they gave on an earlier reply wins over the couple's tag: they
  // have already been asked once and corrected it.
  const groupDefault = p.existing?.groupName || (p.defaultGroup && p.groups.includes(p.defaultGroup) ? p.defaultGroup : '');

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
          <select id="rsvp-group" name="groupName" className="inv-field" defaultValue={groupDefault}>
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
          <div className="space-y-4">
            {Array.from({ length: seats - 1 }, (_, i) => (
              /*
               * One pair of boxes per seat past the guest's own: who they are,
               * then who they are. The relationship is asked first and the name
               * follows it, because "my yaya" is the thing a guest knows
               * immediately and the spelling of her name is what they pause
               * over — and a row that is still blank shows one box rather than
               * two, so four companions do not read as eight empty fields.
               *
               * The name also shows whenever there is already a name to show.
               * A reply saved before this question existed carries names and no
               * relationships, and hiding those behind a pull-down they never
               * answered would lose them from the form.
               *
               * Stacked, not side by side: this card is the width of a phone
               * whatever it is opened on, a hair under 300px, and two boxes
               * sharing that leaves too little of each.
               */
              <div key={i} className="space-y-1">
                <select
                  className="inv-field"
                  value={companions[i]?.relation ?? ''}
                  aria-label={p.labels.relation}
                  onChange={(e) => setCompanion(i, { relation: e.target.value })}
                >
                  <option value="">{p.labels.companion.replace('{n}', String(i + 1))}</option>
                  {p.relations.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                {(companions[i]?.relation || companions[i]?.name) && (
                  <input
                    className="inv-field"
                    placeholder={p.labels.relationName}
                    value={companions[i]?.name ?? ''}
                    autoComplete="off"
                    aria-label={p.labels.relationName}
                    onChange={(e) => setCompanion(i, { name: e.target.value })}
                  />
                )}
              </div>
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

      {/*
        * The number is required; the address is taken if it is offered.
        *
        * The address is not marked optional, and that is deliberate rather than
        * an oversight: "(optional)" beside a field is read as "skip me", and a
        * guest who skips it costs the couple the only way of reaching them that
        * is not a text message. It is asked plainly instead, and a guest who has
        * no address simply carries on — nothing stops them.
        *
        * Both carry a line saying what they are for. They are the only two
        * things asked here that are not about the day itself, so a guest who is
        * not told why reads them as the form being nosy.
        */}
      <div>
        <label className="inv-label" htmlFor="rsvp-phone">{p.labels.phone}</label>
        <input id="rsvp-phone" name="phone" className="inv-field" inputMode="tel" autoComplete="tel" required defaultValue={p.existing?.phone ?? ''} />
        <p className="inv-muted mt-1 text-xs">{p.labels.phoneHint}</p>
      </div>

      <div>
        <label className="inv-label" htmlFor="rsvp-email">{p.labels.email}</label>
        <input id="rsvp-email" name="email" type="email" className="inv-field" inputMode="email" autoComplete="email" defaultValue={p.existing?.email ?? ''} />
        <p className="inv-muted mt-1 text-xs">{p.labels.emailHint}</p>
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
 * Adding photos to the shared album. Phone-first: the file input opens the
 * camera roll directly, what the guest picked is previewed from local object
 * URLs so nothing has to travel before they can see it, and the form stays on
 * the page afterwards because guests arrive with several photos, not one.
 *
 * Several at a time, because they arrive that way. The upload endpoint takes
 * one file per request, and this sends them one after another rather than at
 * once: the server counts each photo against the album's hourly ceilings as it
 * arrives, and a burst fired in parallel would race past a limit that a queue
 * respects. It also means a photo that is refused — too large, wrong format —
 * is named on its own instead of failing the whole batch.
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
    accepts: string;
    caption: string;
    submit: string;
    submitMany: string;
    sending: string;
    pending: string;
    pendingMany: string;
    thanks: string;
    thanksMany: string;
    another: string;
    tooMany: string;
    sent: string;
  };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [chosen, setChosen] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState(0);
  const [done, setDone] = useState<{ kind: 'pending' | 'posted'; count: number } | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // Object URLs are a document-lifetime resource; without this every photo a
  // guest picks stays in memory until they leave the page.
  useEffect(() => () => { previews.forEach((url) => URL.revokeObjectURL(url)); }, [previews]);

  function replacePreviews(files: File[]) {
    setPreviews((old) => {
      old.forEach((url) => URL.revokeObjectURL(url));
      return files.map((f) => URL.createObjectURL(f));
    });
  }

  function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.currentTarget.files ?? []);
    const files = picked.slice(0, PHOTOS_AT_ONCE);
    setChosen(files);
    replacePreviews(files);
    setNote(picked.length > PHOTOS_AT_ONCE ? labels.tooMany : '');
    setError('');
  }

  function clear(form: HTMLFormElement) {
    form.reset();
    setChosen([]);
    replacePreviews([]);
    setAt(0);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!chosen.length) {
      setError(labels.choose);
      return;
    }

    const fields = new FormData(form);
    setBusy(true);
    setError('');
    setNote('');

    let sent = 0;
    let pending = false;
    let failure = '';
    for (const [i, file] of chosen.entries()) {
      setAt(i);
      const fd = new FormData();
      fd.set('slug', slug);
      if (token) fd.set('token', token);
      fd.set('name', String(fields.get('name') ?? ''));
      fd.set('caption', String(fields.get('caption') ?? ''));
      fd.set('website', String(fields.get('website') ?? ''));
      fd.set('file', file);
      try {
        const res = await fetch('/api/public/photos', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Something went wrong.');
        sent++;
        pending = pending || Boolean(json.pending);
      } catch (err) {
        failure = (err as Error).message;
        // A full album and a spent allowance are answers about the album, not
        // about this photo: the rest of the batch would only collect the same
        // refusal, so stop and say it once.
        if (/full|try again/i.test(failure)) break;
      }
    }

    setBusy(false);
    if (sent) {
      setDone({ kind: pending ? 'pending' : 'posted', count: sent });
      clear(form);
    }
    // Said even when some went: "6 sent" with nothing about the other two is a
    // guest who thinks all eight arrived.
    if (failure) setError(sent ? `${sent} / ${chosen.length} ${labels.sent} ${failure}` : failure);
  }

  if (done && !error) {
    const many = done.count > 1;
    return (
      <div className="inv-card space-y-3 text-center">
        <p>{done.kind === 'pending' ? (many ? labels.pendingMany : labels.pending) : many ? labels.thanksMany : labels.thanks}</p>
        <button type="button" className="inv-btn inv-btn-outline" onClick={() => { setDone(null); setError(''); }}>
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
          multiple
          required
          onChange={choose}
          className="inv-field"
        />
        <p className="inv-muted mt-1 text-xs">{labels.accepts}</p>
      </div>
      {previews.length > 0 && (
        <ul className={previews.length === 1 ? '' : 'grid grid-cols-3 gap-2'}>
          {previews.map((url, i) => (
            <li key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className={previews.length === 1 ? 'max-h-56 w-full rounded-xl object-cover' : 'aspect-square w-full rounded-lg object-cover'}
                style={busy && i < at ? { opacity: 0.4 } : undefined}
              />
            </li>
          ))}
        </ul>
      )}
      <div>
        <label className="inv-label" htmlFor="gp-caption">{labels.caption}</label>
        <input id="gp-caption" name="caption" maxLength={280} className="inv-field" />
      </div>
      <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {note && <p className="inv-muted text-sm">{note}</p>}
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--bad, #8f1d17)' }}>{error}</p>}
      <button type="submit" className="inv-btn w-full" disabled={busy}>
        {busy
          ? chosen.length > 1 ? `${labels.sending} ${at + 1} / ${chosen.length}` : labels.sending
          : chosen.length > 1 ? labels.submitMany : labels.submit}
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
 * The pictures pinned to the screen (PageSpec.pin), one layer fixed behind
 * the column, and which of them shows.
 *
 * A pinned picture belongs to a run of pages — its own and the ones after
 * it that sit on it — and every page in a run carries the head's key in
 * `data-pin`. The picture that shows is the one whose run holds the middle
 * of the screen; as the pages of the next run reach it, that one fades in
 * over this. Measured on scroll and on resize, a frame at a time, because
 * where a run begins and ends is the pages' own business and changes with
 * every answer typed. Short of the first run the first picture shows, and
 * past the foot of one the picture just left stays until the next run
 * arrives: a head shorter than half a screen keeps its picture, and on a
 * laptop the sides of a page that sits on no pin keep the last one.
 */
export function Pinned({ pins, phoneWindow = 639 }: {
  pins: {
    key: string; url: string; night?: string; column?: boolean;
    /** the same background drawn for a phone, where she gave one: the window chooses */
    phone?: { url: string; night?: string };
  }[];
  /**
   * The widest window that counts as a phone's, for a page carrying both
   * pictures: `PHONE_WINDOW`, handed in rather than imported, because this
   * island is in every guest's bundle and the document module is not.
   */
  phoneWindow?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const layer = ref.current;
    const stage = layer?.closest<HTMLElement>('.inv-stage');
    const inv = stage?.querySelector<HTMLElement>('.inv');
    if (!layer || !inv) return;
    let frame = 0;
    const settle = () => {
      frame = 0;
      const pages = Array.from(inv.querySelectorAll<HTMLElement>('.inv-page[data-pin]'));
      if (!pages.length) return;
      // the runs: the first and the last page of each, by the head's key
      const runs = new Map<string, { top: number; bottom: number }>();
      for (const p of pages) {
        const head = p.dataset.pin!;
        const r = p.getBoundingClientRect();
        const run = runs.get(head);
        if (run) { run.top = Math.min(run.top, r.top); run.bottom = Math.max(run.bottom, r.bottom); }
        else runs.set(head, { top: r.top, bottom: r.bottom });
      }
      // the middle of the layer's own box: the window, or the part of it the studio's canvas shows
      const box = layer.getBoundingClientRect();
      const middle = box.height > 0 ? box.top + box.height / 2 : window.innerHeight / 2;
      // the run the middle is in; past the foot of one and short of the next, the one just left, so a
      // head shorter than half the screen keeps its picture and the sides keep the last one on a laptop
      let active: string | undefined;
      for (const [head, run] of runs) if (active === undefined || run.top <= middle) active = head;
      for (const pin of Array.from(layer.querySelectorAll<HTMLElement>('.inv-pin'))) {
        if (pin.dataset.pin === active) pin.setAttribute('data-active', '');
        else pin.removeAttribute('data-active');
      }
    };
    const ask = () => { if (!frame) frame = requestAnimationFrame(settle); };
    settle();
    window.addEventListener('scroll', ask, { passive: true });
    window.addEventListener('resize', ask);
    // a page grows as its words arrive, and the opening's overlay leaves: both move the runs
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(ask) : null;
    ro?.observe(inv);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', ask);
      window.removeEventListener('resize', ask);
      ro?.disconnect();
    };
  }, [pins]);
  return (
    <div ref={ref} className="inv-pins" aria-hidden="true">
      {pins.map((pin) => (
        <div key={pin.key} className="inv-pin" data-pin={pin.key} data-column={pin.column ? '' : undefined} data-night-art={pin.night ? '' : undefined}>
          {/*
            * One picture or two. Where she has given a background for the
            * phone as well as one for the whole website, the window picks
            * between them — a media query, so the browser chooses before it
            * fetches and neither picture is ever stretched into the other's
            * shape. The marks the night rules read stay on the <img>.
            */}
          <picture>
            {pin.phone && <source media={`(max-width: ${phoneWindow}px)`} srcSet={pin.phone.url} />}
            <img src={pin.url} alt="" data-day="" decoding="async" />
          </picture>
          {pin.night && (
            <picture>
              {pin.phone?.night && <source media={`(max-width: ${phoneWindow}px)`} srcSet={pin.phone.night} />}
              <img src={pin.night} alt="" data-night="" decoding="async" loading="lazy" />
            </picture>
          )}
        </div>
      ))}
    </div>
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
type Ground = { url: string; ratio: number; top: string; bottom: string; slices?: { top: string; foot: string; mid: string }; night?: string; runsOn?: number };
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
      /*
       * A page that grows, before anything else is measured: its floor comes
       * from the stylesheet, and what its elements need comes from the
       * elements. Their places are set from the page's width rather than its
       * height (see elementStyle), so raising the page does not move them and
       * the measurement settles in one pass. It is done here because this is
       * the pass that already holds every page's box, and because the ground
       * below is laid from heights this changes.
       */
      for (const p of pages) {
        if (!p.hasAttribute('data-grow')) continue;
        const art = p.firstElementChild as HTMLElement | null;
        if (!art) continue;
        const top = p.getBoundingClientRect().top;
        let low = 0;
        for (const child of Array.from(art.children) as HTMLElement[]) {
          // what holds the foot is placed from the foot, so it follows the
          // page down and can never be what pushes it — counting it would
          // make the page grow by its own height on every pass. The mark is
          // read rather than the style: an absolutely placed box reports a
          // used `bottom` in pixels, never `auto`, so the style cannot say.
          if (child.hasAttribute('data-foot')) continue;
          const r = child.getBoundingClientRect();
          if (r.height) low = Math.max(low, r.bottom - top);
        }
        // a little air under the lowest thing, the same as the seam allows above
        const want = low ? `${Math.ceil(low + width * 0.04)}px` : '';
        if (p.style.minHeight !== want) p.style.minHeight = want;
      }
      /*
       * Night, per paper rather than per design.
       *
       * A picture drawn for the night is drawn as it is; a picture drawn for
       * the day is darkened and tinted. Those are two different papers and a
       * design may want one of each — a cover shot at dusk over pages that
       * are only turned down — so the choice is made where the picture is
       * chosen, and each paper carries the answer on itself.
       *
       * A design with a night picture for every page therefore comes out
       * exactly as it did when this was all-or-nothing, and a design with
       * none comes out exactly as it did too. Both shipped designs are the
       * second case: neither carries night art, so every paper is darkened.
       */
      const dark = inv.dataset.mode === 'night';
      const byNumber = (n: number) => {
        const i = (n - 1) % backgrounds.length;
        const dusk = dark ? night?.[i] : '';
        return dusk ? { url: dusk, night: true } : { url: backgrounds[i], night: false };
      };
      const segs: { url: string; bg: number; top: number; height: number; foot: boolean; above: number; below: number; own?: Ground; night: boolean; run?: string; bleed?: boolean }[] = [];
      /*
       * A picture that reaches the whole website page is drawn at the
       * stage's width — the window's, on a laptop — in the column and beside
       * it alike, so the column shows exactly the middle of the one picture
       * across the page. On a phone the stage is the column and nothing
       * changes.
       */
      const stage = inv.closest<HTMLElement>('.inv-stage');
      const stageW = stage?.clientWidth || width;
      const stageTop = stage ? stage.getBoundingClientRect().top : invTop;
      let k = 0;
      // a page on a picture pinned to the screen is see-through to that picture (Pinned): no paper under it,
      // and the papers on either side stop at its edges rather than dissolving into it
      const onPin = (p: HTMLElement | undefined) => Boolean(p?.hasAttribute('data-pin'));
      const tailPinned = onPin(pages[pages.length - 1]);
      pages.forEach((p, i) => {
        if (onPin(p)) return;
        const r = p.getBoundingClientRect();
        const top = r.top - invTop;
        const lastPage = i === pages.length - 1;
        const own = grounds && p.dataset.bg ? grounds[p.dataset.bg] : undefined;
        const bg = width * (own ? own.ratio : ratio);
        if (!bg) return;
        /*
         * A picture that runs on. The page after the head sits on the same
         * picture, so it joins the paper before it — one length of the
         * picture down both, and no join between them — rather than
         * starting a paper of its own.
         */
        const run = own ? p.dataset.run : undefined;
        const prev = segs[segs.length - 1];
        if (run && prev && prev.run === run) {
          prev.height = top + r.height - prev.top;
          prev.foot = lastPage;
          return;
        }
        const seam = seamOf(p);
        const join = onPin(pages[i - 1]) ? { above: 0, below: 0 } : joinOf(p, pages[i - 1], seam);
        // A page with a ground of its own always sits on that one ground,
        // whatever its height. By number: a page up to a tenth taller than one
        // background (with the seam it reaches into) stays on one, drawn a
        // little larger; a longer page is split evenly over as many as it
        // needs, each trimmed to its share.
        const count = own ? 1 : Math.max(1, Math.ceil((r.height + seam) / (bg * 1.1)));
        const share = r.height / count;
        for (let j = 0; j < count; j++) {
          const foot = lastPage && j === count - 1;
          /*
           * A page's own ground is drawn by night from its `night` picture
           * where it has one. The cut-in-three path below has no night cut of
           * its own — a ground is cut once, for the day — so a page tall
           * enough to need the slices is darkened whatever its night picture
           * says, and says so by not carrying the mark.
           */
          const dusk = own && dark && own.night ? own.night : '';
          const picked = own ? { url: dusk || own.url, night: Boolean(dusk) } : byNumber(foot ? last : order[Math.min(k++, order.length - 1)]);
          // a page split over several backgrounds joins itself half and half
          const half = Math.round(seam / 2);
          segs.push({ ...picked, bg, top: top + j * share, height: share, foot, above: j === 0 ? join.above : half, below: j === 0 ? join.below : seam - half, own, run, bleed: own ? p.hasAttribute('data-bleed') : false });
        }
      });
      // The papers to draw: one per segment, and under a page shorter than its
      // own ground, a second that brings the ground's foot in beneath the words.
      // Earlier papers lie on top of later ones, and every paper but the last
      // dissolves out across its foot (`out`) — over the next paper, which
      // starts that far up, opaque. A foot paper also fades in at its top
      // (`seam`), over its own page's ground.
      const papers: { className: string; top: number; height: number; seam: number; out: number; z: number; draw: (el: HTMLElement) => void; bleed?: boolean; page?: HTMLElement }[] = [];
      segs.forEach((s, i) => {
        const first = i === 0;
        const final = i === segs.length - 1;
        // starts its share of the join up inside the page before, and reaches
        // the next join's foot, dissolving out across it
        const half = first ? 0 : s.above;
        const nextHalf = final ? 0 : segs[i + 1].below;
        const out = final ? 0 : segs[i + 1].above + segs[i + 1].below;
        const top = first ? s.top : s.top - half;
        // the last paper runs to the column's foot — unless the pages there sit on a pinned picture
        const bottom = final ? (tailPinned ? s.top + s.height : inv.scrollHeight) : s.top + s.height + nextHalf;
        const box = bottom - top;
        const z = 2 * (segs.length - i);
        const g = s.own;
        const bgH = Math.round(s.bg);
        if (g && g.slices && s.height < bgH * 0.96 && !s.bleed) {
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
            // the cut foot is the day picture: it is darkened like any other
            el.toggleAttribute('data-night-art', false);
          } });
        }
        papers.splice(papers.length - (g && g.slices && s.height < bgH * 0.96 && !s.bleed ? 1 : 0), 0, { className: `inv-paper${first ? ' is-first' : ''}${s.foot && !s.own ? ' is-foot' : ''}`, top, height: box, seam: 0, out, z, bleed: s.bleed, page: s.bleed ? pages.find((p) => p.dataset.bg && grounds && grounds[p.dataset.bg] === s.own) : undefined, draw: (el) => {
        if (s.own && s.bleed) {
          // one picture across the whole page, at the stage's width, from the paper's top: the column shows its middle
          const g = s.own;
          const bgPx = Math.round(stageW * g.ratio);
          el.style.backgroundImage = `url("${s.url}"), linear-gradient(to bottom, ${g.top} 0, ${g.top} 0px, ${g.bottom} ${bgPx}px, ${g.bottom} 100%)`;
          el.style.backgroundSize = `${stageW}px auto, 100% 100%`;
          el.style.backgroundPosition = 'center top, center top';
          el.style.backgroundRepeat = 'no-repeat';
          el.toggleAttribute('data-night-art', s.night);
        } else if (s.own) {
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
            el.style.backgroundImage = `url("${s.url}"), linear-gradient(to bottom, ${g.top} 0, ${g.top} ${startY}px, ${g.bottom} ${startY + bgH}px, ${g.bottom} 100%)`;
            el.style.backgroundSize = `${tall ? `auto ${Math.round(s.height + half)}px` : '100% auto'}, 100% 100%`;
            el.style.backgroundPosition = `center ${startY}px, center top`;
          }
          el.style.backgroundRepeat = 'no-repeat';
          // Drawn for the night, so drawn as it is. The cut-in-three path
          // above has only the day's cuts, so a page tall enough to need them
          // is darkened even where a night picture exists — said here rather
          // than left to be discovered from a page that came out wrong.
          el.toggleAttribute('data-night-art', s.night && !(tall && Boolean(g.slices)));
        } else {
          // taller than its background: drawn to the box's height, the sides trimmed
          el.style.backgroundSize = box > s.bg ? 'auto 100%' : '100% auto';
          el.style.backgroundPosition = '';
          el.style.backgroundRepeat = '';
          const src = `url("${s.url}")`;
          if (el.style.backgroundImage !== src) el.style.backgroundImage = src;
          el.toggleAttribute('data-night-art', s.night);
        }
        } });
      });
      /*
       * The colour beside each page, out to the window's edge. The stage is
       * what is beside the column, so the bands are its background: one
       * gradient with a hard-edged stripe for every page that names a colour
       * (`data-outside`, see outsideOf), measured here because a page's
       * height is its words'. A role is read off the invitation's own
       * variables; by night a role would be the day's colour beside a
       * darkened page, so only a colour of the page's own is drawn then.
       */
      if (stage) {
        const stops: string[] = [];
        for (const p of pages) {
          const want = p.dataset.outside;
          if (!want) continue;
          const role = ['bg', 'surface', 'ink', 'muted', 'accent', 'accent2'].includes(want);
          if (role && dark) continue;
          const colour = role ? getComputedStyle(inv).getPropertyValue(`--inv-${want}`).trim() : want;
          if (!colour) continue;
          const r = p.getBoundingClientRect();
          const a = Math.round(r.top - stageTop);
          const b = Math.round(r.bottom - stageTop);
          if (b <= a) continue;
          stops.push(`transparent ${a}px, ${colour} ${a}px, ${colour} ${b}px, transparent ${b}px`);
        }
        const beside = stops.length ? `linear-gradient(to bottom, ${stops.join(', ')})` : '';
        if (stage.style.getPropertyValue('--inv-outside') !== beside) {
          if (beside) stage.style.setProperty('--inv-outside', beside);
          else stage.style.removeProperty('--inv-outside');
        }
      }
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
      /*
       * The whole ground is night art only when every paper is. The tint on
       * the ground shows through the dissolves where the papers meet, so it
       * belongs to the joins rather than to any one page: a design drawn for
       * the night throughout wants none of it, and a design with one night
       * page among darkened ones still wants its joins to read as night.
       * Read off what was actually drawn, so the mark and the pictures cannot
       * disagree.
       */
      /*
       * Beside the column, the pictures that reach the whole website page:
       * a band on the stage for each such paper, the same picture at the
       * same size from the same top, with the paper's own dissolves, so the
       * column's copy and the band read as one. A clip behind the page rides
       * along as a copy of its own frame. Nothing is drawn where the stage
       * is the column.
       */
      if (stage && stageW > width + 1) {
        const bleeding = papers.filter((pp) => pp.bleed);
        const bands = [...stage.querySelectorAll<HTMLElement>(':scope > .inv-beside')];
        while (bands.length > bleeding.length) bands.pop()?.remove();
        bleeding.forEach((pp, i) => {
          let band = bands[i];
          if (!band) {
            band = document.createElement('div');
            band.className = 'inv-paper inv-beside';
            band.setAttribute('aria-hidden', 'true');
            stage.insertBefore(band, stage.firstChild);
            bands.push(band);
          }
          const paper = ground.children[papers.indexOf(pp)] as HTMLElement | undefined;
          band.style.top = `${Math.round(pp.top + (invTop - stageTop))}px`;
          band.style.height = `${Math.round(pp.height)}px`;
          band.style.zIndex = String(pp.z);
          band.style.setProperty('--seam', `${pp.seam}px`);
          band.style.setProperty('--out', `${pp.out}px`);
          if (paper) {
            band.style.backgroundImage = paper.style.backgroundImage;
            band.style.backgroundSize = paper.style.backgroundSize;
            band.style.backgroundPosition = paper.style.backgroundPosition;
            band.style.backgroundRepeat = paper.style.backgroundRepeat;
            band.toggleAttribute('data-night-art', paper.hasAttribute('data-night-art'));
          }
          const clip = pp.page?.querySelector<HTMLElement>('.inv-bb-clip[data-bg] > video, .inv-bb-clip[data-bg] > img');
          const had = band.firstElementChild as HTMLElement | null;
          const src = clip?.getAttribute('src') ?? '';
          if (clip && (!had || had.getAttribute('src') !== src)) {
            band.replaceChildren();
            const copy = clip.cloneNode(true) as HTMLElement;
            if (copy instanceof HTMLVideoElement) { copy.muted = true; copy.autoplay = true; copy.loop = true; copy.playsInline = true; void copy.play().catch(() => {}); }
            band.appendChild(copy);
          } else if (!clip && had) band.replaceChildren();
        });
      } else if (stage) {
        for (const band of stage.querySelectorAll(':scope > .inv-beside')) band.remove();
      }
      const papersDrawn = [...ground.children] as HTMLElement[];
      ground.toggleAttribute('data-night-art', dark && papersDrawn.length > 0 && papersDrawn.every((el) => el.hasAttribute('data-night-art')));
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

/**
 * The way out of a design's peek. Two signs, because they mean two things:
 * the arrow steps back to wherever the visitor came from, and the cross
 * closes the peek and leaves them at the designs. They sit above the opening
 * too, so nobody is held by a clip they have seen enough of.
 */
export function PeekControls({ href, backLabel, closeLabel }: { href: string; backLabel: string; closeLabel: string }) {
  const step = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (typeof window === 'undefined' || window.history.length <= 1) return;
    try {
      if (!document.referrer || new URL(document.referrer).origin !== window.location.origin) return;
    } catch {
      // a referrer we cannot read is not one we can step back to
      return;
    }
    e.preventDefault();
    window.history.back();
  };
  return (
    <div className="inv-peek-controls no-print">
      <a href={href} className="inv-peek-btn" onClick={step} aria-label={backLabel} title={backLabel}>←</a>
      <a href={href} className="inv-peek-btn" aria-label={closeLabel} title={closeLabel}>×</a>
    </div>
  );
}

/**
 * A short clip on a page, loaded and played only while a guest is looking at
 * it.
 *
 * Everything here is about what a guest's phone and connection do, not about
 * what looks best on a desk:
 *
 * - **No `autoplay` attribute.** It is the one thing that would undo the rest:
 *   a browser given `autoplay` fetches the file when the element mounts,
 *   whatever `preload` says, so every clip on every page of the invitation
 *   would download the moment the page opened. `play()` is called by hand
 *   instead, once the clip is actually in view.
 * - **`preload="none"`** until then, and `src` is not even set: an unset
 *   source is a request that cannot happen. This is what the range requests
 *   the bucket serves are for — the file arrives in pieces as it plays,
 *   rather than whole before it starts.
 * - **Half in view, and it plays; out of view, and it pauses.** A guest
 *   scrolling past a page should not leave four clips running behind them,
 *   which is battery and data both.
 * - **`saveData` means never.** A guest who has told their phone to spare
 *   their data has told us too, and the poster is a perfectly good page.
 *   Reduced motion is respected the same way: a clip is motion.
 * - **A refused `play()` is not an error.** iOS in Low Power Mode refuses
 *   every one, and the honest answer is the poster, which is already there.
 *
 * Muted and looping are not choices either: a page that makes noise at
 * somebody reading an invitation on a bus is a page they close, and it is
 * also the only way a browser will play anything without a tap.
 */
/**
 * Motion on a guest's page: the arrivals, and the slow idling.
 *
 * Everything about it is off until this runs, and that is the safe way
 * round rather than the timid one. An element that enters starts invisible,
 * so if the rule that hides it were in the stylesheet unconditionally then a
 * guest with no JavaScript — or one whose script failed, or a crawler, or a
 * printed page — would be looking at an invitation with holes in it. So the
 * hiding is behind `data-motion`, which is set here, after the browser has
 * been asked whether this guest wants motion at all. No script, no
 * attribute, nothing hidden.
 *
 * `data-in` is added the first time an element is actually on screen and
 * never taken off: an arrival that happened three screens above the reader
 * is not an arrival, and one that replays every time they scroll back is a
 * page that will not settle. The idle animations are keyed on the same
 * attribute, so nothing is animating on a page nobody is looking at.
 *
 * The same three questions as a clip — reduced motion, saveData, in view —
 * because they are the same question: this is motion, and a guest who has
 * said no to a clip has not said yes to a floating photograph.
 */
export function Motion() {
  useEffect(() => {
    const root = document.querySelector('.inv');
    if (!root) return;
    const save = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    if (save || still) return;
    root.setAttribute('data-motion', '');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute('data-in', '');
          io.unobserve(e.target);
        }
      },
      // a tenth of it is enough to count as arrived: a tall element would
      // otherwise have to be half read before it began
      { threshold: 0.1 },
    );
    for (const el of root.querySelectorAll('[data-enter], [data-idle]')) io.observe(el);
    return () => {
      io.disconnect();
      root.removeAttribute('data-motion');
    };
  }, []);
  return null;
}

/**
 * A hub: the objects a guest taps, and the booklets they open.
 *
 * Off until this runs, for the reason Motion is off until Motion runs. A
 * booklet's pages are rendered in the column, after it, so a guest with no
 * JavaScript — or one whose script failed, or a crawler, or the printed
 * page — reads the whole invitation as one scroll with nothing missing.
 * `data-hub` is what takes them out of the scroll and puts them behind a
 * tap. No script, no attribute, nothing hidden.
 *
 * It also refuses to turn the hub on at all unless it finds at least one
 * object whose booklet this invitation actually carries. A design can name
 * a booklet the package left out — no programme, no programme page — and an
 * object that opens nothing must not be made to look as though it would.
 *
 * ## Why an attribute and not React state
 *
 * The objects are drawn deep inside a page by a server component, and the
 * booklets are siblings of that page. There is no shared ancestor to hold
 * state in short of making the whole column a client component, which is a
 * large price for one boolean. So the DOM is the state, the way the
 * envelope and the motion already work here.
 *
 * ## Why nothing navigates
 *
 * A tap that loaded a page would stop the song, replay the opening, and
 * meet a guest coming back with the sealed envelope again. So the booklet
 * is shown in place and nothing unmounts. What it borrows from navigation
 * is only the history entry, so that Android's own back button closes the
 * booklet instead of leaving the invitation — and closing is *always*
 * `history.back()`, from the button, from Escape, from anywhere, so there
 * is one path through and the DOM cannot drift from the history.
 */
export function Hub() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.inv');
    if (!root) return;
    const booklets = new Map<string, HTMLElement>();
    for (const el of root.querySelectorAll<HTMLElement>('.inv-booklet')) {
      if (el.dataset.booklet) booklets.set(el.dataset.booklet, el);
    }
    const openers = [...root.querySelectorAll<HTMLElement>('[data-opens]')]
      .filter((el) => booklets.has(el.dataset.opens ?? ''));
    if (!openers.length) return;
    root.setAttribute('data-hub', '');

    /** the object the guest came in by, so closing gives them the focus back */
    let from: HTMLElement | null = null;

    const show = (key: string | null) => {
      for (const [name, el] of booklets) {
        const on = name === key;
        if (on) el.setAttribute('data-open', '');
        else el.removeAttribute('data-open');
        if (on) el.scrollTop = 0;
      }
      for (const el of openers) el.setAttribute('aria-expanded', String(el.dataset.opens === key));
      if (key) root.setAttribute('data-booklet-open', key);
      else root.removeAttribute('data-booklet-open');
      // the way back is where a keyboard lands, and the object is where it
      // is given back — a guest tabbing through the hub should not have to
      // find their place again
      if (key) booklets.get(key)?.querySelector<HTMLElement>('[data-back]')?.focus();
      else if (from) { from.focus(); from = null; }
    };

    const open = (el: HTMLElement) => {
      const key = el.dataset.opens;
      if (!key || !booklets.has(key)) return;
      from = el;
      history.pushState({ invBooklet: key }, '');
      show(key);
    };

    const onPop = () => {
      const key = (history.state as { invBooklet?: string } | null)?.invBooklet;
      show(key && booklets.has(key) ? key : null);
    };

    const onClick = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('[data-back]')) { history.back(); return; }
      const opener = t.closest<HTMLElement>('[data-opens]');
      if (opener && openers.includes(opener)) { e.preventDefault(); open(opener); }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && root.hasAttribute('data-booklet-open')) { history.back(); return; }
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const opener = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-opens]');
      if (opener && openers.includes(opener)) { e.preventDefault(); open(opener); }
    };

    // an object drawn as a shape or a photograph is not a button until it is
    // told it is one, and a guest on a screen reader is given the booklet's
    // own name rather than "button"
    for (const el of openers) {
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-expanded', 'false');
      const key = el.dataset.opens ?? '';
      el.setAttribute('aria-controls', `booklet-${key}`);
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', booklets.get(key)?.dataset.label || key.replace(/-/g, ' '));
    }

    root.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    return () => {
      root.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      for (const el of booklets.values()) el.removeAttribute('data-open');
      for (const el of openers) {
        for (const a of ['role', 'tabindex', 'aria-expanded', 'aria-controls']) el.removeAttribute(a);
      }
      root.removeAttribute('data-booklet-open');
      root.removeAttribute('data-hub');
    };
  }, []);
  return null;
}

/**
 * A vector animation on a page: a Lottie, played by lottie-web.
 *
 * The player is a third of a megabyte, so it is imported *inside* the
 * observer's callback rather than at the top of this file: a guest whose
 * invitation carries no animation never downloads a byte of it, and a guest
 * whose animation is four pages down does not download it until they get
 * there. That is also why the poster exists — it is what stands in until the
 * player has arrived, and what stands in for ever for the three people who
 * will never see the animation at all:
 *
 * - a guest who asked their phone for less motion,
 * - a guest sparing their data,
 * - a printed page.
 *
 * The poster and the player have a box each, side by side, because React
 * owns one and lottie-web owns the other and neither should be reaching into
 * the other's children.
 */
export function LazyLottie({ src, poster, loop = true, speed = 1, className, style }: {
  src: string; poster?: string; loop?: boolean; speed?: number; className?: string; style?: CSSProperties;
}) {
  const stage = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const save = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    if (save || still) return;

    let anim: import('lottie-web/build/player/esm/lottie_light.min.js').LottieAnimation | null = null;
    let gone = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) { anim?.pause(); continue; }
          if (anim) { anim.play(); continue; }
          // the first time it is on screen is the first time the player is
          // fetched at all
          void (async () => {
            const lottie = (await import('lottie-web/build/player/esm/lottie_light.min.js')).default;
            if (gone || !stage.current) return;
            anim = lottie.loadAnimation({
              container: stage.current,
              renderer: 'svg',
              loop,
              autoplay: true,
              path: src,
              rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
            });
            anim.setSpeed(speed);
            setPlaying(true);
          })();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      gone = true;
      io.disconnect();
      anim?.destroy();
      setPlaying(false);
    };
  }, [src, loop, speed]);

  return (
    <div className={className} style={style} data-anim={playing ? 'on' : ''}>
      <div ref={stage} className="inv-anim-stage" />
      {!playing && poster && <img className="inv-anim-poster" src={poster} alt="" />}
    </div>
  );
}

export function LazyVideo({ src, webm, poster, loop = true, className, style }: { src: string; webm?: string; poster?: string; loop?: boolean; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Asked once, on the client, where the answer exists. A guest sparing
    // their data, or asking for less motion, gets the poster and no request.
    const save = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    if (save || still) return;

    let armed = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            // the first time it comes into view is the first time the file is
            // asked for at all: the sources are written in only now
            if (!armed) {
              armed = true;
              for (const s of el.querySelectorAll('source')) s.setAttribute('src', s.dataset.src ?? '');
              el.load();
            }
            el.play().catch(() => setRefused(true));
          } else if (!el.paused) {
            el.pause();
          }
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      className={className}
      style={style}
      poster={poster}
      muted
      // A clip that does not loop stops on its last frame and stays there,
      // which is right for a message to camera and wrong for a ribbon
      // turning in the wind. The design says which it is.
      loop={loop}
      playsInline
      preload="none"
      // A refused play leaves the poster showing, which is the point; the
      // controls are not offered, because a page's clip is decoration and a
      // play button on decoration invites a guest to think they missed
      // something.
      data-refused={refused ? '' : undefined}
      aria-hidden
    >
      {webm && <source data-src={webm} type="video/webm" />}
      <source data-src={src} type="video/mp4" />
    </video>
  );
}

/**
 * The parts, listed, for a guest who does not want to read all of it.
 *
 * `parts` is worked out on the server from what was actually drawn, so this
 * only ever offers somewhere that exists. It is a button and a sheet rather
 * than a bar across the page: an invitation's artwork is the thing being
 * sold, and a permanent strip of navigation over a hand-drawn sky is the one
 * way to make a beautiful design look like a brochure. The button is small,
 * sits clear of the phone's own bars, and gets out of the way once used.
 *
 * Scrolling is smooth unless the guest has asked their phone for less
 * motion, in which case it jumps — the same courtesy the rest of the
 * invitation pays.
 */
export function Contents({ parts, label, closeLabel }: { parts: { id: string; label: string }[]; label: string; closeLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    // The anchor lives in the invitation, which on the print view and in the
    // studio's single-page canvas may not be this element's own document.
    const doc = ref.current?.ownerDocument ?? document;
    const target = id === 'top' ? doc.querySelector<HTMLElement>('.inv') : doc.getElementById(id);
    if (!target) return;
    const gentle = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: gentle ? 'auto' : 'smooth', block: 'start' });
  };

  if (parts.length < 2) return null;

  return (
    <div className="inv-contents" ref={ref} data-open={open ? '' : undefined}>
      <button type="button" className="inv-contents-open" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="inv-contents-list">
        <span aria-hidden="true" className="inv-contents-rules" />
        {label}
      </button>
      {open && (
        <>
          <button type="button" className="inv-contents-behind" onClick={() => setOpen(false)} aria-label={closeLabel} />
          <nav id="inv-contents-list" className="inv-contents-list" aria-label={label}>
            <ul>
              {parts.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => go(p.id)}>{p.label}</button>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}
