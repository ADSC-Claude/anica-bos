/**
 * The people on the dress code page: gentlemen in suits, ladies in gowns,
 * drawn as fashion plates — no faces, a neck and hands, the clothes doing
 * the talking — in whatever colours the couple picked. Every garment is one
 * flat colour under a sheen (a gradient of light from the left) and a few
 * fold lines, so any colour reads as satin or wool without a second asset.
 *
 * All figures share a 120 × 300 box, feet at the bottom, so a row of them
 * stands on one line.
 */
import type { ReactNode } from 'react';

const SKIN = '#d9b391';
const SKIN_DARK = '#c49a76';
const SHOE = '#3a2a1f';
const TIE = '#2a2523';

function Sheen({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
        <stop offset="0.3" stopColor="#fff" stopOpacity="0.14" />
        <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.26" />
      </linearGradient>
      <linearGradient id={`${id}-v`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.2" />
      </linearGradient>
    </defs>
  );
}

/** A garment: the same paths as the flat colour, the sheen, and a soft fall of shadow toward the hem. */
function Cloth({ d, color, id, children }: { d: string; color: string; id: string; children?: ReactNode }) {
  return (
    <>
      <path d={d} fill={color} />
      <path d={d} fill={`url(#${id})`} />
      <path d={d} fill={`url(#${id}-v)`} />
      {children}
    </>
  );
}

const NECK = 'M53 0h14v11c-4 4-10 4-14 0z';

/**
 * A suit worn open-handed: coat, shirt, tie (or an open collar), trousers
 * with a crease, and dress shoes. The hands are in the pockets, the way a
 * groomsman stands for a photograph.
 */
export function SuitFigure({ color, tie = true, id }: { color: string; tie?: boolean; id: string }) {
  const coat = 'M48 15L32 21l-2 46 3 68 3 15h22l2-54z M72 15l16 6 2 46-3 68-3 15H62l-2-54z';
  const lapelL = 'M48 15l12 81-6-32-13-34z';
  const lapelR = 'M72 15L60 96l6-32 13-34z';
  const sleeveL = 'M33 21c-7 4-11 11-12 21l-4 68 8 20 9-4 2-66z';
  const sleeveR = 'M87 21c7 4 11 11 12 21l4 68-8 20-9-4-2-66z';
  const trousers = 'M36 150h48l-3 114-18 1-3-66-3 66-18-1z';
  return (
    <svg viewBox="0 0 120 300" className="inv-figure" aria-hidden>
      <Sheen id={id} />
      <path d={NECK} fill={SKIN} />
      <path d="M53 8c2 3 12 3 14 0v6c-3 5-11 5-14 0z" fill={SKIN_DARK} opacity="0.5" />
      {/* shirt */}
      <path d={tie ? 'M50 14l10 22 10-22 4 4-14 40-14-40z' : 'M48 14l12 30 12-30 5 6-17 46-17-46z'} fill="#f7f3ea" />
      {tie && <path d="M57 20h6l-1 9 3 49-5 8-5-8 3-49z" fill={TIE} />}
      {tie && <path d="M57 20h6l-1 9h-4z" fill="#fff" opacity="0.12" />}
      <Cloth d={trousers} color={color} id={id}>
        <path d="M48 150l-2 114M72 150l2 114" stroke="#000" strokeOpacity="0.14" strokeWidth="1.2" fill="none" />
        <path d="M41 152v112M79 152v112" stroke="#fff" strokeOpacity="0.14" strokeWidth="1" fill="none" />
      </Cloth>
      <Cloth d={coat} color={color} id={id}>
        <path d={lapelL} fill="#000" opacity="0.1" />
        <path d={lapelR} fill="#000" opacity="0.16" />
        <path d="M48 15l12 81M72 15L60 96" stroke="#fff" strokeOpacity="0.22" fill="none" />
        <path d="M60 96v54" stroke="#000" strokeOpacity="0.22" fill="none" />
        <circle cx="60" cy="100" r="1.7" fill={TIE} />
        <circle cx="60" cy="118" r="1.7" fill={TIE} />
        <path d="M75 56h9l-1 6h-8z" fill="#f7f3ea" />
        <path d="M34 100l6 2-1 16-6-2z M86 100l-6 2 1 16 6-2z" fill="#000" opacity="0.12" />
      </Cloth>
      <Cloth d={sleeveL} color={color} id={id}>
        <path d="M27 42c-3 22-4 46-3 74" stroke="#000" strokeOpacity="0.12" fill="none" />
      </Cloth>
      <Cloth d={sleeveR} color={color} id={id}>
        <path d="M93 42c3 22 4 46 3 74" stroke="#000" strokeOpacity="0.2" fill="none" />
      </Cloth>
      {/* shoes */}
      <path d="M34 264h20l2 10c-8 4-19 4-26 0z M66 264h20l4 10c-7 4-19 4-26 0z" fill={SHOE} />
      <path d="M36 266h17M68 266h17" stroke="#fff" strokeOpacity="0.18" fill="none" />
    </svg>
  );
}

/**
 * Five gowns — a strapless sweetheart with a slit, a halter, a square neck
 * with a full skirt, a cowl slip with a high slit, and one shoulder — so a
 * row of ladies is a row of different dresses in the couple's colours.
 */
export function GownFigure({ color, style, id }: { color: string; style: number; id: string }) {
  const armL = 'M42 22c-8 3-13 9-15 20l-6 66c-1 6 0 12 4 14 4 1 7-2 8-8l6-62 5-24z';
  const armR = 'M78 22c8 3 13 9 15 20l6 66c1 6 0 12-4 14-4 1-7-2-8-8l-6-62-5-24z';
  let body: ReactNode;
  switch (style % 5) {
    case 0: {
      // strapless sweetheart, draped, slit on the right
      const bodice = 'M39 44c7 6 14 6 21-2 7 8 14 8 21 2l2 62c-5 6-41 6-46 0z';
      const skirt = 'M37 106c5 6 41 6 46 0l3 36 4 60 9 88H70l-2-60-6 60H24l6-92z';
      body = (
        <>
          <path d="M66 190h20l3 100H70z" fill={SKIN} />
          <path d="M72 286h14l2 6H70z" fill={SKIN_DARK} />
          <Cloth d={skirt} color={color} id={id}>
            <path d="M48 120c-2 60-10 120-16 168M58 118c0 60-6 120-10 170" stroke="#000" strokeOpacity="0.1" fill="none" />
            <path d="M40 122c8 6 26 8 40 2" stroke="#fff" strokeOpacity="0.28" fill="none" />
          </Cloth>
          <Cloth d={bodice} color={color} id={id}>
            <path d="M42 60c6 8 30 8 36 0" stroke="#000" strokeOpacity="0.1" fill="none" />
            <path d="M39 44c7 6 14 6 21-2 7 8 14 8 21 2" stroke="#fff" strokeOpacity="0.3" fill="none" />
          </Cloth>
        </>
      );
      break;
    }
    case 1: {
      // halter, gathered at the waist, straight column
      const bodice = 'M41 40h38l4 66c-5 6-41 6-46 0z';
      const skirt = 'M37 106c5 6 41 6 46 0l4 66 2 118H32l2-118z';
      body = (
        <>
          <path d="M54 8l-12 34 8 2 10-30zM66 8l12 34-8 2-10-30z" fill={color} />
          <Cloth d={skirt} color={color} id={id}>
            <path d="M50 120c-2 60-6 120-8 170M70 120c2 60 6 120 8 170" stroke="#000" strokeOpacity="0.1" fill="none" />
          </Cloth>
          <Cloth d={bodice} color={color} id={id}>
            <path d="M48 44l6 50M60 42v54M72 44l-6 50" stroke="#000" strokeOpacity="0.1" fill="none" />
          </Cloth>
        </>
      );
      break;
    }
    case 2: {
      // square neck, thin straps, full A-line skirt
      const bodice = 'M40 34h40l4 72c-6 6-42 6-48 0z';
      const skirt = 'M36 106c6 6 42 6 48 0l6 66 11 118H20l11-118z';
      body = (
        <>
          <path d="M46 14l2 22h5l-2-22zM74 14l-2 22h-5l2-22z" fill={color} />
          <Cloth d={skirt} color={color} id={id}>
            <path d="M46 120c-4 60-14 120-22 168M74 120c4 60 14 120 22 168" stroke="#000" strokeOpacity="0.1" fill="none" />
            <path d="M60 118v170" stroke="#fff" strokeOpacity="0.2" fill="none" />
          </Cloth>
          <Cloth d={bodice} color={color} id={id}>
            <path d="M40 34h40" stroke="#fff" strokeOpacity="0.4" fill="none" />
          </Cloth>
        </>
      );
      break;
    }
    case 3: {
      // cowl neck slip, high slit on the left
      const bodice = 'M42 42c10 14 26 14 36 0l5 64c-5 6-41 6-46 0z';
      const skirt = 'M37 106c5 6 41 6 46 0l4 66 6 118H62l-6-70-4 70H30l2-118z';
      body = (
        <>
          <path d="M46 12l-4 30M74 12l4 30" stroke={color} strokeWidth="2" fill="none" />
          <path d="M34 190h20l-1 100H32z" fill={SKIN} />
          <path d="M34 286h14l2 6H32z" fill={SKIN_DARK} />
          <Cloth d={skirt} color={color} id={id}>
            <path d="M66 120c2 60 6 120 8 170" stroke="#000" strokeOpacity="0.1" fill="none" />
            <path d="M74 118c0 60 6 120 10 172" stroke="#fff" strokeOpacity="0.18" fill="none" />
          </Cloth>
          <Cloth d={bodice} color={color} id={id}>
            <path d="M42 42c10 14 26 14 36 0" stroke="#fff" strokeOpacity="0.32" fill="none" />
            <path d="M46 52c8 10 20 10 28 0" stroke="#000" strokeOpacity="0.12" fill="none" />
          </Cloth>
        </>
      );
      break;
    }
    default: {
      // one shoulder, flowing
      const bodice = 'M40 26h16l6 20h18l4 60c-6 6-42 6-48 0z';
      const skirt = 'M36 106c6 6 42 6 48 0l6 66 13 118H18l13-118z';
      body = (
        <>
          <Cloth d={skirt} color={color} id={id}>
            <path d="M46 120c-4 60-14 120-24 168M66 120c2 60 4 120 6 170" stroke="#000" strokeOpacity="0.1" fill="none" />
            <path d="M56 118c-2 60-8 120-14 170" stroke="#fff" strokeOpacity="0.18" fill="none" />
          </Cloth>
          <Cloth d={bodice} color={color} id={id}>
            <path d="M40 26h16l6 20h18" stroke="#fff" strokeOpacity="0.36" fill="none" />
          </Cloth>
        </>
      );
    }
  }
  return (
    <svg viewBox="0 0 120 300" className="inv-figure" aria-hidden>
      <Sheen id={id} />
      <path d={NECK} fill={SKIN} />
      <path d="M53 8c2 3 12 3 14 0v6c-3 5-11 5-14 0z" fill={SKIN_DARK} opacity="0.5" />
      <path d={armL} fill={SKIN} />
      <path d={armR} fill={SKIN} />
      <path d="M78 22c8 3 13 9 15 20l6 70" stroke="#000" strokeOpacity="0.08" fill="none" strokeWidth="3" />
      {body}
    </svg>
  );
}
