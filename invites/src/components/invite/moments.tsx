'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { MOMENT_BY_KEY, SPEED_FACTOR, type MomentKey, type Speed, type Trigger } from '@/lib/moments';

/**
 * An interactive moment as a guest meets it: a thing that is closed until
 * they tap, swipe or hold, and then opens the way the real thing would.
 *
 * One component plays every scene. The scene is markup (`Scene`) and a
 * stylesheet keyed on three attributes this component sets on the box:
 * `data-state` (closed → opening → open), `data-trigger`, and the two
 * custom properties every scene's motion reads — `--moment-t`, the speed
 * as a multiplier of the scene's durations, and `--moment-drag`, how far
 * a swipe or a hold has got, 0 to 1. A tap sets `opening` and the
 * stylesheet does the rest; a swipe moves `--moment-drag` under the finger
 * with the transitions off and, let go past halfway, completes; a hold
 * fills `--moment-drag` while the finger stays and drains it if it leaves
 * early. The full-screen openings use the same scenes and the same
 * attributes on their overlay, so one stylesheet serves both.
 *
 * What is never in doubt: the still. A guest who asked for less motion, a
 * printed page, a page without scripts, and the studio's canvas all get the
 * moment open, with its photograph and words showing — the open state is
 * the honest one, and the closed one is the invitation to get there.
 */

export type MomentState = 'closed' | 'opening' | 'open';

const OPEN_MEMORY = 'inv-moments';

/** Which moments this guest has already opened, by id, for `plays: 'once'`. */
function remembered(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(OPEN_MEMORY) || '[]') as string[]);
  } catch {
    return new Set();
  }
}
function remember(id: string) {
  try {
    const all = remembered();
    all.add(id);
    sessionStorage.setItem(OPEN_MEMORY, JSON.stringify([...all]));
  } catch {
    /* private mode: the moment simply plays again next time */
  }
}

function lessMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/**
 * The gesture and the state, for the in-page moment and the opening alike.
 *
 * `onOpen` fires once, when the gesture completes; the caller decides what
 * the reveal is (a state change here, or the overlay's exit). `duration`
 * is the scene's at Normal; the state reaches `open` after it, scaled by
 * the speed, so anything waiting on "it has finished" has one clock.
 */
export function useMomentGesture({ trigger, speed = 'normal', duration, swipe, disabled, onOpen }: {
  trigger: Trigger | undefined;
  speed?: Speed;
  duration: number;
  swipe?: 'up' | 'down' | 'apart' | 'left' | 'right';
  disabled?: boolean;
  onOpen?: () => void;
}) {
  const [state, setState] = useState<MomentState>('closed');
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; w: number; h: number; id: number } | null>(null);
  const holdFrame = useRef<number | null>(null);
  const holdFrom = useRef<{ at: number; from: number } | null>(null);
  const t = SPEED_FACTOR[speed] ?? 1;

  const open = useCallback(() => {
    if (disabled) return;
    setState((s) => (s === 'closed' ? 'opening' : s));
    setDrag(1);
    setDragging(false);
    onOpen?.();
  }, [disabled, onOpen]);

  // opening → open on the scene's own clock, at this speed
  useEffect(() => {
    if (state !== 'opening') return;
    const id = window.setTimeout(() => setState('open'), Math.round(duration * t) + 60);
    return () => window.clearTimeout(id);
  }, [state, duration, t]);

  const reset = useCallback(() => {
    setState('closed');
    setDrag(0);
    setDragging(false);
  }, []);

  const stopHold = useCallback(() => {
    if (holdFrame.current !== null) cancelAnimationFrame(holdFrame.current);
    holdFrame.current = null;
    holdFrom.current = null;
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (disabled || state !== 'closed') return;
    if (trigger === 'tap') return; // the click handles it, so a tap and a scroll are told apart by the browser
    const box = e.currentTarget.getBoundingClientRect();
    start.current = { x: e.clientX, y: e.clientY, w: box.width, h: box.height, id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (trigger === 'hold') {
      setDragging(true);
      // the ring fills over 1.2 s at Normal; it drains on release at the same rate
      const per = 1200 * t;
      holdFrom.current = { at: performance.now(), from: drag };
      const tick = () => {
        const h = holdFrom.current;
        if (!h) return;
        const d = Math.min(1, h.from + (performance.now() - h.at) / per);
        setDrag(d);
        if (d >= 1) { stopHold(); open(); return; }
        holdFrame.current = requestAnimationFrame(tick);
      };
      holdFrame.current = requestAnimationFrame(tick);
    }
  }, [disabled, state, trigger, t, drag, open, stopHold]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || trigger !== 'swipe' || state !== 'closed') return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    // how far the finger has to travel for the swipe to be whole: a good
    // part of the box, so a stray touch while scrolling does nothing
    let d = 0;
    switch (swipe) {
      case 'apart': d = Math.abs(dx) / (s.w * 0.45); break;
      case 'down': d = dy / (s.h * 0.6); break;
      case 'left': d = -dx / (s.w * 0.6); break;
      case 'right': d = dx / (s.w * 0.6); break;
      default: d = -dy / (s.h * 0.6);
    }
    d = Math.max(0, Math.min(1, d));
    if (d > 0.02 && !dragging) setDragging(true);
    setDrag(d);
  }, [trigger, state, swipe, dragging]);

  const onPointerUp = useCallback(() => {
    if (!start.current) return;
    start.current = null;
    if (trigger === 'hold') {
      // let go early: the ring drains back at the same rate it filled
      stopHold();
      if (state === 'closed') {
        setDragging(false);
        setDrag(0);
      }
      return;
    }
    if (trigger === 'swipe' && state === 'closed') {
      setDragging(false);
      if (drag >= 0.5) open();
      else setDrag(0);
    }
  }, [trigger, state, drag, open, stopHold]);

  const onClick = useCallback(() => {
    if (trigger === 'tap') open();
  }, [trigger, open]);

  useEffect(() => stopHold, [stopHold]);

  return {
    state,
    drag,
    dragging,
    open,
    reset,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClick },
    vars: { '--moment-t': String(t), '--moment-drag': drag.toFixed(3) } as CSSProperties,
  };
}

/**
 * A moment on a page.
 *
 * `photos` are its photographs, already resolved by the page that draws it,
 * and `words` what it reveals in writing. Where the scene holds them
 * itself (the print in the instant camera, the flip card's back face) they
 * go into the scene; otherwise they are the reveal, drawn over the scene
 * once it has moved aside. In the studio (`edit`) it is drawn open, and a
 * `inv-moment-play` event on the box closes and plays it, which is what the
 * Play it button sends.
 *
 * Three scenes open by a mechanic of their own rather than a gesture, and
 * those live here rather than in the stylesheet: the scratch card is a
 * canvas the finger clears, the secret code is a keypad, the puzzle is
 * nine tiles swapped by two taps.
 */
export function Moment({ id, scene, variant, trigger, speed, plays, hint, edit, photos = [], words, code, monogram, className, style, attrs }: {
  id: string;
  scene: MomentKey;
  variant?: string;
  trigger?: Trigger;
  speed?: Speed;
  plays?: 'once' | 'always';
  hint: string;
  edit?: boolean;
  photos?: string[];
  words?: ReactNode;
  /** the secret code's answer */
  code?: string;
  monogram?: string;
  className?: string;
  style?: CSSProperties;
  attrs?: Record<string, string | undefined>;
}) {
  const def = MOMENT_BY_KEY[scene];
  const box = useRef<HTMLDivElement | null>(null);
  // the still: open from the start where motion is not wanted, in the studio, where this guest already opened it, or where a code has no answer
  const browses = def?.mechanic === 'browse';
  const [still, setStill] = useState(Boolean(edit) || (def?.mechanic === 'keys' && !code) || browses);
  const g = useMomentGesture({ trigger, speed, duration: def?.duration ?? 1200, swipe: def?.swipe, disabled: still });
  // the latest gesture, for the handlers that outlive a render (the studio's Play it fires after the still is taken off)
  const latest = useRef(g);
  latest.current = g;

  useEffect(() => {
    if (edit) return;
    if (lessMotion() || (plays !== 'always' && remembered().has(id))) setStill(true);
  }, [edit, plays, id]);

  // opened by hand: remembered, so scrolling back finds it open
  useEffect(() => {
    if (g.state === 'open' && plays !== 'always') remember(id);
  }, [g.state, plays, id]);

  // plays every time: closed again once it has left the screen
  useEffect(() => {
    if (plays !== 'always' || still || !box.current) return;
    const el = box.current;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (!e.isIntersecting && g.state === 'open') g.reset();
    }, { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [plays, still, g]);

  // the studio's Play it: close it, then open it on the next frame so the transitions run
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const play = () => {
      setStill(false);
      latest.current.reset();
      // the next frame, once the still is off and the gesture is enabled again
      window.setTimeout(() => latest.current.open(), 80);
    };
    el.addEventListener('inv-moment-play', play);
    return () => el.removeEventListener('inv-moment-play', play);
  }, []);

  const state: MomentState = still ? 'open' : g.state;
  const holds = def?.holds ?? {};
  const photoNode = !holds.photo && photos[0] ? <img src={photos[0]} alt="" loading="lazy" /> : null;
  const wordsNode = !holds.words ? words : null;
  const reveal = photoNode || wordsNode ? <>{photoNode}{wordsNode}</> : undefined;
  // a scene opened by its own mechanic takes no gesture, so the keypad and the tiles keep their own taps
  const gestured = Boolean(trigger) && !still;
  return (
    <div
      ref={box}
      className={`inv-moment${className ? ` ${className}` : ''}`}
      style={{ ...style, ...g.vars }}
      data-moment={scene}
      data-variant={variant || undefined}
      data-state={state}
      data-trigger={trigger}
      data-dragging={g.dragging ? '' : undefined}
      data-still={still ? '' : undefined}
      role={gestured ? 'button' : undefined}
      tabIndex={gestured ? 0 : undefined}
      aria-label={gestured ? hint : undefined}
      onKeyDown={gestured ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.open(); } } : undefined}
      {...(gestured ? g.handlers : {})}
      {...attrs}
    >
      <Scene scene={scene} variant={variant} photos={holds.photo ? photos : []} monogram={monogram} words={holds.words ? words : undefined} />
      {reveal !== undefined && <div className="inv-moment-reveal">{reveal}</div>}
      {def?.mechanic === 'rub' && !still && <Scratch open={g.open} state={g.state} frost={scene === 'frost' ? photos[0] : undefined} />}
      {def?.mechanic === 'keys' && !still && code && <Keypad code={code} open={g.open} state={g.state} />}
      {def?.mechanic === 'drag' && <Tiles id={id} photo={photos[0]} open={g.open} state={state} still={still} />}
      {browses && <Browse scene={scene} photos={photos} words={words} edit={Boolean(edit)} speed={speed} />}
      {trigger === 'hold' && !still && (
        <svg className="inv-moment-ring" viewBox="0 0 40 40" aria-hidden>
          <circle cx="20" cy="20" r="18" pathLength={1} />
          <circle cx="20" cy="20" r="18" pathLength={1} className="inv-moment-ring-fill" />
        </svg>
      )}
      {(!still || (browses && !edit && photos.length > 1)) && <p className="inv-moment-hint" aria-hidden>{hint}</p>}
    </div>
  );
}

/**
 * The film strip, the album and the carousel: photographs a guest browses
 * rather than opens. The strip and the carousel slide under the finger and
 * settle on the nearest; the album turns a leaf. Words, where the moment
 * has them, are the caption under whichever is showing.
 */
function Browse({ scene, photos, words, edit, speed = 'normal' }: { scene: MomentKey; photos: string[]; words?: ReactNode; edit: boolean; speed?: Speed }) {
  const [at, setAt] = useState(0);
  const [drag, setDrag] = useState(0);
  const [turning, setTurning] = useState<'next' | 'prev' | null>(null);
  const start = useRef<{ x: number; w: number } | null>(null);
  const t = SPEED_FACTOR[speed] ?? 1;
  const per = scene === 'album' ? 2 : 1;
  const pages = Math.max(1, Math.ceil(photos.length / per));
  const go = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(pages - 1, at + dir));
    if (next === at) return;
    if (scene === 'album') {
      setTurning(dir > 0 ? 'next' : 'prev');
      window.setTimeout(() => { setAt(next); setTurning(null); }, Math.round(900 * t));
    } else setAt(next);
  };
  const onDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (edit || turning) return;
    start.current = { x: e.clientX, w: e.currentTarget.getBoundingClientRect().width };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const st = start.current;
    if (!st) return;
    setDrag(Math.max(-1, Math.min(1, (e.clientX - st.x) / (st.w * 0.5))));
  };
  const onUp = () => {
    if (!start.current) return;
    start.current = null;
    const d = drag;
    setDrag(0);
    if (d <= -0.35) go(1);
    else if (d >= 0.35) go(-1);
  };
  const vars = { ['--browse-at' as string]: String(at), ['--browse-drag' as string]: drag.toFixed(3), ['--moment-t' as string]: String(t) } as CSSProperties;
  const caption = words ? <div className="inv-mo-caption">{words}</div> : null;
  if (scene === 'album') {
    const spread = (i: number) => [photos[i * 2], photos[i * 2 + 1]];
    const [l, r] = spread(at);
    const [nl, nr] = spread(at + 1);
    const [pl, pr] = spread(at - 1);
    return (
      <div className="inv-mo-browse inv-mo-album" style={vars} data-turning={turning ?? undefined} data-first={at === 0 ? '' : undefined} data-last={at >= pages - 1 ? '' : undefined} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <span className="inv-mo-album-page" data-side="l">{turning === 'prev' ? (pl && <img src={pl} alt="" />) : (l && <img src={l} alt="" />)}</span>
        <span className="inv-mo-album-page" data-side="r">{turning === 'next' ? (nr && <img src={nr} alt="" />) : (r && <img src={r} alt="" />)}</span>
        {turning && (
          <span className="inv-mo-album-leaf" data-dir={turning}>
            <span className="inv-mo-album-face" data-face="front">{turning === 'next' ? (r && <img src={r} alt="" />) : (l && <img src={l} alt="" />)}</span>
            <span className="inv-mo-album-face" data-face="back">{turning === 'next' ? (nl && <img src={nl} alt="" />) : (pr && <img src={pr} alt="" />)}</span>
          </span>
        )}
        <span className="inv-mo-album-spine" />
        {caption}
      </div>
    );
  }
  return (
    <div className={`inv-mo-browse inv-mo-${scene === 'film-strip' ? 'strip' : 'carousel'}`} style={vars} data-first={at === 0 ? '' : undefined} data-last={at >= pages - 1 ? '' : undefined} data-dragging={drag !== 0 ? '' : undefined} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <span className="inv-mo-track">
        {photos.map((u, i) => (
          <span key={i} className="inv-mo-shot" data-at={i === at ? '' : undefined} style={{ ['--i' as string]: String(i) }}><img src={u} alt="" loading="lazy" /></span>
        ))}
      </span>
      {scene === 'film-strip' && <><span className="inv-mo-sprockets" data-edge="top" /><span className="inv-mo-sprockets" data-edge="bottom" /></>}
      {caption}
      {photos.length > 1 && (
        <span className="inv-mo-dots">{photos.map((_, i) => <i key={i} data-on={i === at ? '' : undefined} />)}</span>
      )}
    </div>
  );
}

/** How much of the foil must be cleared before the rest falls away: past half, the guest has seen what is under it. */
const SCRATCH_DONE = 0.55;

/**
 * The scratch card: a foil the finger clears, on a canvas over the reveal.
 * The foil is painted once at the box's size; each stroke cuts a soft-edged
 * circle out of it; every few strokes the cleared share is read off a
 * coarse sample of the pixels, and past six tenths the whole card opens.
 */
function Scratch({ open, state, frost }: { open: () => void; state: MomentState; /** the photograph, for a frosted glass: a blurred, whitened copy is what the finger clears */ frost?: string }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const down = useRef(false);
  const strokes = useRef(0);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const paint = () => {
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      c.width = Math.round(w * (window.devicePixelRatio > 1 ? 1.5 : 1));
      c.height = Math.round(h * (window.devicePixelRatio > 1 ? 1.5 : 1));
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const cs = getComputedStyle(c);
      if (frost) {
        // the glass: the photograph out of focus under a white breath, until the finger passes
        ctx.fillStyle = 'rgba(235,238,242,1)'; ctx.fillRect(0, 0, c.width, c.height);
        const img = new Image();
        img.onload = () => {
          const ctx2 = c.getContext('2d');
          if (!ctx2) return;
          // paint over what is there: the rub set the context to cut, and this is the same context
          ctx2.globalCompositeOperation = 'source-over';
          ctx2.save();
          ctx2.filter = 'blur(14px) saturate(0.7) brightness(1.15)';
          // cover: the same crop the sharp photograph has under it
          const s = Math.max(c.width / img.width, c.height / img.height);
          const dw = img.width * s, dh = img.height * s;
          ctx2.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
          ctx2.restore();
          ctx2.fillStyle = 'rgba(255,255,255,0.42)'; ctx2.fillRect(0, 0, c.width, c.height);
          ctx2.globalCompositeOperation = 'destination-out';
        };
        img.src = frost;
        ctx.globalCompositeOperation = 'destination-out';
        return;
      }
      const accent = cs.getPropertyValue('--inv-accent').trim() || '#a08a5a';
      // brushed foil: the accent under a diagonal sheen and fine lines
      const g = ctx.createLinearGradient(0, 0, c.width, c.height);
      g.addColorStop(0, accent); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(0.55, accent); g.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = accent; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      for (let y = 0; y < c.height; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke(); }
      ctx.globalCompositeOperation = 'destination-out';
    };
    paint();
  }, []);
  const clearedShare = (c: HTMLCanvasElement): number => {
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    const step = 6;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let clear = 0, all = 0;
    // a half-cleared pixel reads as cleared: the soft edge of a stroke shows what is under it
    for (let y = 0; y < c.height; y += step) for (let x = 0; x < c.width; x += step) { all++; if (data[(y * c.width + x) * 4 + 3]! < 128) clear++; }
    return all ? clear / all : 0;
  };
  const rub = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current;
    if (!c || !down.current || state !== 'closed') return;
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * c.width;
    const y = ((e.clientY - r.top) / r.height) * c.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // a thumb's width: a tenth of the card, soft at the edge
    const rad = c.width * 0.1;
    const grad = ctx.createRadialGradient(x, y, rad * 0.4, x, y, rad);
    grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    if (++strokes.current % 8 === 0 && clearedShare(c) >= SCRATCH_DONE) open();
  };
  return (
    <canvas
      ref={canvas}
      className="inv-mo-foil"
      aria-hidden
      onPointerDown={(e) => { down.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); rub(e); }}
      onPointerMove={rub}
      onPointerUp={() => { down.current = false; }}
      onPointerCancel={() => { down.current = false; }}
    />
  );
}

/** The secret code's keypad: digits in, a wrong answer shakes once and clears, the right one opens the latch. */
function Keypad({ code, open, state }: { code: string; open: () => void; state: MomentState }) {
  const [typed, setTyped] = useState('');
  const [wrong, setWrong] = useState(false);
  const press = (d: string) => {
    if (state !== 'closed' || wrong) return;
    if (d === '⌫') { setTyped((t) => t.slice(0, -1)); return; }
    const next = (typed + d).slice(0, code.length);
    setTyped(next);
    if (next.length === code.length) {
      if (next === code) { open(); return; }
      setWrong(true);
      window.setTimeout(() => { setWrong(false); setTyped(''); }, 600);
    }
  };
  return (
    <div className="inv-mo-keys" data-wrong={wrong ? '' : undefined} onPointerDown={(e) => e.stopPropagation()}>
      <p className="inv-mo-dial" aria-live="polite">
        {Array.from({ length: code.length }, (_, i) => <span key={i} data-on={i < typed.length ? '' : undefined} />)}
      </p>
      <div className="inv-mo-keygrid">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
          k ? <button key={i} type="button" onClick={() => press(k)} aria-label={k === '⌫' ? 'back' : k}>{k}</button> : <span key={i} />
        ))}
      </div>
    </div>
  );
}

/** A small deterministic shuffle, seeded by the moment's id, so a guest who comes back finds the same puzzle. */
function shuffled(seed: string, n: number): number[] {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  // never already solved
  if (out.every((v, i) => v === i)) [out[0], out[1]] = [out[1]!, out[0]!];
  return out;
}

/** The puzzle: nine tiles of the one photograph, two taps to swap a pair; solved, the seams go and the whole opens. */
function Tiles({ id, photo, open, state, still }: { id: string; photo?: string; open: () => void; state: MomentState; still: boolean }) {
  const solvedOrder = Array.from({ length: 9 }, (_, i) => i);
  // the server and the first paint show it solved (the still); the shuffle comes once on the guest's screen
  const [order, setOrder] = useState<number[]>(solvedOrder);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    if (!still && state === 'closed') setOrder(shuffled(id, 9));
    if (still || state !== 'closed') setOrder(Array.from({ length: 9 }, (_, i) => i));
  }, [still, state, id]);
  const tap = (i: number) => {
    if (state !== 'closed' || still) return;
    if (picked === null) { setPicked(i); return; }
    if (picked === i) { setPicked(null); return; }
    const next = [...order];
    [next[picked], next[i]] = [next[i]!, next[picked]!];
    setOrder(next);
    setPicked(null);
    if (next.every((v, k) => v === k)) open();
  };
  return (
    <div className="inv-mo-tiles" onPointerDown={(e) => e.stopPropagation()}>
      {order.map((piece, i) => (
        <button
          key={i}
          type="button"
          className="inv-mo-tile"
          data-picked={picked === i ? '' : undefined}
          aria-label={`piece ${piece + 1}`}
          onClick={() => tap(i)}
          style={photo ? { backgroundImage: `url(${photo})`, backgroundPosition: `${(piece % 3) * 50}% ${Math.floor(piece / 3) * 50}%` } : undefined}
        />
      ))}
    </div>
  );
}

/**
 * The scenes themselves: what is on the page before it opens, drawn so the
 * stylesheet can move each piece on its own hinge. Every piece is
 * `aria-hidden`: the moment's box carries the label, and what it reveals is
 * ordinary content.
 */
export function Scene({ scene, variant, photos = [], monogram, words }: { scene: MomentKey; variant?: string; photos?: string[]; monogram?: string; words?: ReactNode }) {
  const photo = photos[0];
  switch (scene) {
    case 'envelope':
    case 'seal':
      return (
        <span className="inv-mo inv-mo-env" aria-hidden>
          <span className="inv-mo-back" />
          <span className="inv-mo-card" />
          <span className="inv-mo-pocket" />
          <span className="inv-mo-flap" />
          {scene === 'seal' && (
            <span className="inv-mo-wax">
              <span className="inv-mo-wax-half" data-side="l"><b>{monogram || '♥'}</b></span>
              <span className="inv-mo-wax-half" data-side="r"><b>{monogram || '♥'}</b></span>
              <svg className="inv-mo-crack" viewBox="0 0 40 40">
                <path d="M4 17 L11 21 L17 16 L22 23 L28 19 L36 22" pathLength={1} />
              </svg>
            </span>
          )}
        </span>
      );
    case 'ribbon':
      return (
        <span className="inv-mo inv-mo-ribbon" aria-hidden>
          <span className="inv-mo-card" />
          <span className="inv-mo-band" data-dir="v" />
          <span className="inv-mo-band" data-dir="h" />
          <svg className="inv-mo-bow" viewBox="0 0 120 80">
            <path className="inv-mo-loop" data-side="l" d="M60 40 C 30 10, 6 18, 14 40 C 6 62, 30 70, 60 40 Z" />
            <path className="inv-mo-loop" data-side="r" d="M60 40 C 90 10, 114 18, 106 40 C 114 62, 90 70, 60 40 Z" />
            <path className="inv-mo-tail" data-side="l" d="M58 44 L40 78 L52 76 L60 52 Z" />
            <path className="inv-mo-tail" data-side="r" d="M62 44 L80 78 L68 76 L60 52 Z" />
            <circle className="inv-mo-knot" cx="60" cy="40" r="7" />
          </svg>
        </span>
      );
    case 'curtains':
      return (
        <span className="inv-mo inv-mo-curtains" data-panels={variant === 'panels' ? '' : undefined} aria-hidden>
          {photo && <img className="inv-mo-behind" src={photo} alt="" loading="lazy" />}
          <span className="inv-mo-rod" />
          <span className="inv-mo-panel" data-side="l" />
          <span className="inv-mo-panel" data-side="r" />
        </span>
      );
    case 'doors':
      return (
        <span className="inv-mo inv-mo-doors" data-church={variant === 'church' ? '' : undefined} aria-hidden>
          {photo && <img className="inv-mo-behind" src={photo} alt="" loading="lazy" />}
          <span className="inv-mo-light" />
          <span className="inv-mo-leaf" data-side="l"><span className="inv-mo-handle" /></span>
          <span className="inv-mo-leaf" data-side="r"><span className="inv-mo-handle" /></span>
          <span className="inv-mo-jamb" />
        </span>
      );
    case 'capiz':
      return (
        <span className="inv-mo inv-mo-capiz" aria-hidden>
          <span className="inv-mo-shell" data-i="0" />
          <span className="inv-mo-shell" data-i="1" />
          <span className="inv-mo-shell" data-i="2" />
          <span className="inv-mo-shell" data-i="3" />
        </span>
      );
    case 'letter':
      return (
        <span className="inv-mo inv-mo-letter" aria-hidden>
          <span className="inv-mo-sheet" />
          <span className="inv-mo-fold" data-i="2" />
          <span className="inv-mo-fold" data-i="0" />
        </span>
      );
    // ── Tap & Reveal ──
    case 'instant-camera':
      return (
        <span className="inv-mo inv-mo-camera" aria-hidden>
          <span className="inv-mo-print">
            <span className="inv-mo-print-photo">{photo && <img src={photo} alt="" loading="lazy" />}</span>
            <span className="inv-mo-print-caption">{words}</span>
          </span>
          <span className="inv-mo-cam-body">
            <span className="inv-mo-cam-slot" />
            <span className="inv-mo-cam-lens"><span /></span>
            <span className="inv-mo-cam-flash" />
            <span className="inv-mo-cam-button" />
          </span>
          <span className="inv-mo-flashlight" />
        </span>
      );
    case 'ring-box':
      return (
        <span className="inv-mo inv-mo-ringbox" aria-hidden>
          <span className="inv-mo-box-lid"><span className="inv-mo-box-lid-inner" /></span>
          <span className="inv-mo-box-base">
            <span className="inv-mo-cushion" />
            <svg className="inv-mo-ring" viewBox="0 0 60 60">
              <circle cx="30" cy="34" r="17" />
              <path className="inv-mo-stone" d="M30 8 L38 16 L30 24 L22 16 Z" />
            </svg>
          </span>
        </span>
      );
    case 'light':
      return (
        <span className="inv-mo inv-mo-light" data-flash={variant === 'flash' ? '' : undefined} aria-hidden>
          <span className="inv-mo-veil" />
          <span className="inv-mo-glow" />
        </span>
      );
    case 'bloom':
      return (
        <span className="inv-mo inv-mo-bloom" aria-hidden>
          <span className="inv-mo-bloom-centre">{photo && <img src={photo} alt="" loading="lazy" />}</span>
          <svg className="inv-mo-petals" viewBox="0 0 200 200">
            {Array.from({ length: 8 }, (_, i) => (
              <path key={i} className="inv-mo-petal" style={{ ['--petal' as string]: String(i) }} d="M100 100 C 66 62, 70 18, 100 6 C 130 18, 134 62, 100 100 Z" />
            ))}
          </svg>
        </span>
      );
    case 'candle':
      return (
        <span className="inv-mo inv-mo-candle" data-cake={variant === 'cake' ? '' : undefined} aria-hidden>
          {variant === 'cake' && (
            <span className="inv-mo-cake">
              <span className="inv-mo-cake-side" />
              <span className="inv-mo-cake-top" />
            </span>
          )}
          <span className="inv-mo-taper">
            <span className="inv-mo-wick" />
            <span className="inv-mo-flame" />
            <span className="inv-mo-smoke" />
          </span>
          <span className="inv-mo-glow" />
        </span>
      );
    case 'gift':
      return (
        <span className="inv-mo inv-mo-gift" data-kind={variant || undefined} aria-hidden>
          <span className="inv-mo-gift-box"><span className="inv-mo-gift-band" /></span>
          <span className="inv-mo-gift-lid"><span className="inv-mo-gift-band" /><span className="inv-mo-gift-bow" /></span>
        </span>
      );
    case 'frame':
      return (
        <span className="inv-mo inv-mo-frame" aria-hidden>
          <span className="inv-mo-frame-photo">{photo && <img src={photo} alt="" loading="lazy" />}</span>
          <span className="inv-mo-cloth" />
        </span>
      );
    // ── Swipe & Pull ──
    case 'pull-card':
      return (
        <span className="inv-mo inv-mo-pull" aria-hidden>
          <span className="inv-mo-pull-card">
            {photo && <span className="inv-mo-pull-photo"><img src={photo} alt="" loading="lazy" /></span>}
            <span className="inv-mo-pull-words">{words}</span>
          </span>
          <span className="inv-mo-pull-pocket" />
          <span className="inv-mo-pull-lip" />
        </span>
      );
    case 'sticker':
      return (
        <span className="inv-mo inv-mo-sticker" aria-hidden>
          <span className="inv-mo-under">{photo && <img src={photo} alt="" loading="lazy" />}</span>
          <span className="inv-mo-peel"><span className="inv-mo-peel-face" /><span className="inv-mo-peel-curl" /></span>
        </span>
      );
    case 'frost':
      // the sharp photograph under the glass; the glass is the canvas the box adds
      return (
        <span className="inv-mo inv-mo-frost" aria-hidden>
          <span className="inv-mo-under">{photo && <img src={photo} alt="" loading="lazy" />}</span>
        </span>
      );
    case 'scroll':
      return (
        <span className="inv-mo inv-mo-scroll" data-diploma={variant === 'diploma' ? '' : undefined} aria-hidden>
          <span className="inv-mo-rod" data-end="top" />
          <span className="inv-mo-paper"><span className="inv-mo-paper-words">{words}</span></span>
          <span className="inv-mo-roll"><span className="inv-mo-roll-tie" /></span>
        </span>
      );
    // ── Photo Moments ──
    case 'polaroid-stack':
      return (
        <span className="inv-mo inv-mo-stack" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="inv-mo-print" data-i={i}>
              <span className="inv-mo-print-photo">{photos[i] && <img src={photos[i]} alt="" loading="lazy" />}</span>
              <span className="inv-mo-print-caption" />
            </span>
          ))}
        </span>
      );
    case 'photo-booth':
      return (
        <span className="inv-mo inv-mo-booth" aria-hidden>
          <span className="inv-mo-booth-front">
            <span className="inv-mo-booth-screen"><b data-n="3">3</b><b data-n="2">2</b><b data-n="1">1</b></span>
            <span className="inv-mo-cam-lens"><span /></span>
            <span className="inv-mo-booth-slot" />
          </span>
          <span className="inv-mo-flashlight" />
          <span className="inv-mo-strip">
            {[0, 1, 2].map((i) => <span key={i} className="inv-mo-strip-shot">{photos[i] && <img src={photos[i]} alt="" loading="lazy" />}</span>)}
          </span>
        </span>
      );
    case 'projector':
      return (
        <span className="inv-mo inv-mo-projector" aria-hidden>
          <span className="inv-mo-screen">{photo && <img src={photo} alt="" loading="lazy" />}</span>
          <span className="inv-mo-beam" />
          <span className="inv-mo-proj-body"><span className="inv-mo-reel" data-i="0" /><span className="inv-mo-reel" data-i="1" /><span className="inv-mo-proj-lens" /></span>
        </span>
      );
    case 'film-strip':
    case 'album':
    case 'carousel':
      // browsed, not opened: the box adds the strip, the leaves or the cards
      return null;
    // ── Occasion ──
    case 'baby':
      return (
        <span className="inv-mo inv-mo-baby" aria-hidden>
          <span className="inv-mo-cloud" data-side="l" />
          <span className="inv-mo-cloud" data-side="r" />
        </span>
      );
    case 'cheers':
      return (
        <span className="inv-mo inv-mo-cheers" aria-hidden>
          <span className="inv-mo-flute" data-side="l"><span className="inv-mo-bowl" /><span className="inv-mo-stem" /><span className="inv-mo-foot" /></span>
          <span className="inv-mo-flute" data-side="r"><span className="inv-mo-bowl" /><span className="inv-mo-stem" /><span className="inv-mo-foot" /></span>
          <span className="inv-mo-clink" />
        </span>
      );
    // ── Surprise ──
    case 'scratch':
      // the foil is the canvas the box adds; the card under it is the reveal
      return <span className="inv-mo inv-mo-scratch" aria-hidden />;
    case 'hold':
      return (
        <span className="inv-mo inv-mo-hold" aria-hidden>
          <span className="inv-mo-veil" data-frost="" />
        </span>
      );
    case 'code':
      return (
        <span className="inv-mo inv-mo-code" aria-hidden>
          <span className="inv-mo-latch" />
        </span>
      );
    case 'puzzle':
      // the tiles are the box's own, since they are tapped
      return <span className="inv-mo inv-mo-puzzle" aria-hidden />;
    case 'flip':
      return (
        <span className="inv-mo inv-mo-flip" aria-hidden>
          <span className="inv-mo-flip-card">
            <span className="inv-mo-face" data-side="front">{photo && <img src={photo} alt="" loading="lazy" />}</span>
            <span className="inv-mo-face" data-side="back">{words}</span>
          </span>
        </span>
      );
    default:
      // a scene not built yet draws nothing to open: the still stands
      return null;
  }
}
