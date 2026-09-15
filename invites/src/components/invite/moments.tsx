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
 * `reveal` is what it opens onto — the photograph and the words, already
 * resolved by the page that draws it — and `scenePhotos` are the pictures
 * a scene carries as part of itself (the one behind the curtains). In the
 * studio (`edit`) it is drawn open, and a `inv-moment-play` event on the
 * box closes and plays it, which is what the Play it button sends.
 */
export function Moment({ id, scene, variant, trigger, speed, plays, hint, edit, scenePhotos, monogram, reveal, className, style, attrs }: {
  id: string;
  scene: MomentKey;
  variant?: string;
  trigger?: Trigger;
  speed?: Speed;
  plays?: 'once' | 'always';
  hint: string;
  edit?: boolean;
  scenePhotos?: string[];
  monogram?: string;
  reveal?: ReactNode;
  className?: string;
  style?: CSSProperties;
  attrs?: Record<string, string | undefined>;
}) {
  const def = MOMENT_BY_KEY[scene];
  const box = useRef<HTMLDivElement | null>(null);
  // the still: open from the start where motion is not wanted, in the studio, or where this guest already opened it
  const [still, setStill] = useState(Boolean(edit));
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
      role={still ? undefined : 'button'}
      tabIndex={still ? undefined : 0}
      aria-label={still ? undefined : hint}
      onKeyDown={still ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.open(); } }}
      {...(still ? {} : g.handlers)}
      {...attrs}
    >
      <Scene scene={scene} variant={variant} photos={scenePhotos} monogram={monogram} />
      {reveal !== undefined && <div className="inv-moment-reveal">{reveal}</div>}
      {trigger === 'hold' && !still && (
        <svg className="inv-moment-ring" viewBox="0 0 40 40" aria-hidden>
          <circle cx="20" cy="20" r="18" pathLength={1} />
          <circle cx="20" cy="20" r="18" pathLength={1} className="inv-moment-ring-fill" />
        </svg>
      )}
      {!still && <p className="inv-moment-hint" aria-hidden>{hint}</p>}
    </div>
  );
}

/**
 * The scenes themselves: what is on the page before it opens, drawn so the
 * stylesheet can move each piece on its own hinge. Every piece is
 * `aria-hidden`: the moment's box carries the label, and what it reveals is
 * ordinary content.
 *
 * The seven here are the openings — the same seven that stand on a page as
 * moments and fill the screen as the invitation's opening.
 */
export function Scene({ scene, variant, photos = [], monogram }: { scene: MomentKey; variant?: string; photos?: string[]; monogram?: string }) {
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
          {photos[0] && <img className="inv-mo-behind" src={photos[0]} alt="" loading="lazy" />}
          <span className="inv-mo-rod" />
          <span className="inv-mo-panel" data-side="l" />
          <span className="inv-mo-panel" data-side="r" />
        </span>
      );
    case 'doors':
      return (
        <span className="inv-mo inv-mo-doors" data-church={variant === 'church' ? '' : undefined} aria-hidden>
          {photos[0] && <img className="inv-mo-behind" src={photos[0]} alt="" loading="lazy" />}
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
    default:
      // a scene not built yet draws nothing to open: the still stands
      return null;
  }
}
