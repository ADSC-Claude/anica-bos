import type { Occasion, Tier } from '@prisma/client';

/**
 * The Interactive Moments library: the 42 interactions a guest taps, swipes
 * or holds, on six shelves, built as 31 scenes.
 *
 * Her brief: launch with these 42 rather than an oversized library; as
 * realistic as possible, so a formal event can use one; where an
 * interaction belongs to more than one category, build it once and tag it
 * under both; when one needs photographs, they come from the customer's
 * form; each has a Speed and, where it applies, a Trigger.
 *
 * So there are two lists. `MOMENTS` is one entry per *scene* — the thing
 * that is built: its markup, its CSS, what it asks for. `SHELVES` is the
 * six categories as she listed them, seven to a shelf, each row naming the
 * scene it is drawn with and, where the shelf's version differs, the
 * variant ("Church Doors" is the doors scene with `variant: 'church'`).
 * The sheet in the studio is drawn from the shelves; the page is drawn
 * from the scenes; a scene on two shelves is one component.
 *
 * `built` says whether the scene's markup and CSS exist yet. The sheet
 * shows every one of the 42 from day one, the unbuilt ones marked as
 * coming, so the library reads as the promise it is — and nothing unbuilt
 * can be placed, so no page ever carries a moment a guest cannot open.
 */

export type Shelf = 'opening' | 'tap' | 'swipe' | 'photo' | 'occasion' | 'surprise';

export const SHELF_NAMES: Record<Shelf, string> = {
  opening: 'Opening Experience',
  tap: 'Tap & Reveal',
  swipe: 'Swipe & Pull',
  photo: 'Photo Moments',
  occasion: 'Occasion Interactions',
  surprise: 'Surprise Moments',
};

export const SHELF_KEYS: Shelf[] = ['opening', 'tap', 'swipe', 'photo', 'occasion', 'surprise'];

/** What the guest does. A scene says which of these it takes; the first is its default. */
export type Trigger = 'tap' | 'swipe' | 'hold';
/** A way of opening that is the scene's own and not a choice: a scratch card is rubbed, a puzzle is dragged, a code is typed. */
export type Mechanic = 'rub' | 'drag' | 'keys' | 'browse';
export type Speed = 'slow' | 'normal' | 'fast';

export const SPEEDS: Speed[] = ['slow', 'normal', 'fast'];
export const SPEED_NAMES: Record<Speed, string> = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };
/** The multiplier every scene's durations are scaled by: `--moment-t` in the stylesheet. */
export const SPEED_FACTOR: Record<Speed, number> = { slow: 1.6, normal: 1, fast: 0.6 };

export type MomentKey =
  | 'envelope' | 'seal' | 'ribbon' | 'curtains' | 'doors' | 'capiz' | 'letter'
  | 'instant-camera' | 'ring-box' | 'light' | 'bloom' | 'candle' | 'gift' | 'frame'
  | 'pull-card' | 'scratch' | 'sticker' | 'frost' | 'scroll'
  | 'polaroid-stack' | 'film-strip' | 'album' | 'photo-booth' | 'projector' | 'carousel'
  | 'baby' | 'cheers'
  | 'hold' | 'code' | 'puzzle' | 'flip';

export type PhotoShape = 'portrait' | 'square' | 'landscape' | 'tall' | 'wide';

export type MomentDef = {
  key: MomentKey;
  /** how the scene is named where it stands alone */
  name: string;
  /** the triggers it takes, the first its default; empty where the mechanic is the scene's own */
  triggers: Trigger[];
  mechanic?: Mechanic;
  /** which way a swipe goes, where it takes one */
  swipe?: 'up' | 'down' | 'apart' | 'left' | 'right';
  /** the photographs it shows, and the shape each is asked in */
  photos: { count: 0 | 1 | 3 | 6; shape: PhotoShape; label: string };
  /** what it reveals in writing, if anything */
  words?: 'line' | 'lines' | 'names' | 'code';
  /** height over width of the box it lands in */
  aspect: number;
  /** how wide it lands, as a share of the column */
  width: number;
  /** how long its motion runs at Normal, in milliseconds, from the trigger to the reveal */
  duration: number;
  minTier: Tier;
  /** the material and the easing, for whoever draws it */
  realism: string;
  /** its markup and stylesheet exist */
  built: boolean;
  /** the variants a shelf may ask for, by name */
  variants?: Record<string, string>;
  /**
   * What the scene draws itself rather than leaving to the reveal: the
   * print in the instant camera carries the photograph and the caption,
   * the flip card's back face carries the words. Left unsaid, the
   * photograph and the words are the reveal's, drawn over the scene once
   * it has moved aside.
   */
  holds?: { photo?: boolean; words?: boolean };
};

export const MOMENTS: MomentDef[] = [
  // ── the seven that open an invitation, and stand on a page as well ──
  {
    key: 'envelope', name: 'Envelope', triggers: ['tap', 'swipe'], swipe: 'up',
    photos: { count: 0, shape: 'landscape', label: '' }, aspect: 0.66, width: 78, duration: 1400, minTier: 'BASIC',
    realism: 'Laid paper with a 1px darker edge; the flap swings on its top fold, its shadow lengthening as it lifts; the card rises on a slow ease-out.',
    built: true,
  },
  {
    key: 'seal', name: 'Wax Seal', triggers: ['tap'],
    photos: { count: 0, shape: 'landscape', label: '' }, aspect: 0.66, width: 78, duration: 1600, minTier: 'BASIC',
    realism: 'A pressed wax disc with a radial highlight; a crack runs across it before the two halves part; only then does the flap lift.',
    built: true,
  },
  {
    key: 'ribbon', name: 'Ribbon', triggers: ['swipe', 'tap'], swipe: 'down',
    photos: { count: 0, shape: 'landscape', label: '' }, aspect: 0.7, width: 74, duration: 1500, minTier: 'BASIC',
    realism: 'A satin band and a bow that slackens before the ribbon slides off the card; one 4% settle at the end and nothing else overshoots.',
    built: true,
  },
  {
    key: 'curtains', name: 'Curtains', triggers: ['swipe', 'tap'], swipe: 'apart', holds: { photo: true },
    photos: { count: 1, shape: 'portrait', label: 'the photograph behind the curtains' }, aspect: 1.25, width: 84, duration: 1400, minTier: 'BASIC',
    realism: 'Velvet with vertical folds and a 3% grain; the panels follow the finger and part with a heavy ease; the photograph waits behind, lit from the top left.',
    built: true,
    variants: { panels: 'Slide Panels' },
  },
  {
    key: 'doors', name: 'Doors', triggers: ['tap', 'swipe'], swipe: 'apart', holds: { photo: true },
    photos: { count: 1, shape: 'portrait', label: 'the photograph behind the doors' }, aspect: 1.511, width: 84, duration: 1600, minTier: 'BASIC',
    realism: 'Two leaves hinged at the outer edges with a real pivot in perspective; brass handles in the accent; the leaves swing out at 900ms and the light comes through first.',
    built: true,
    variants: { church: 'Church Doors' },
  },
  {
    key: 'capiz', name: 'Capiz Panels', triggers: ['tap'],
    photos: { count: 0, shape: 'landscape', label: '' }, aspect: 1, width: 80, duration: 1500, minTier: 'BASIC',
    realism: 'Shell panels, translucent with a mother-of-pearl sheen in the surface colour and gold seams; the two middle panels fold first and the outer follow, on shutter hinges.',
    built: true,
  },
  {
    key: 'letter', name: 'Folded Letter', triggers: ['tap'],
    photos: { count: 0, shape: 'landscape', label: '' }, aspect: 0.8, width: 74, duration: 1700, minTier: 'BASIC',
    realism: 'A tri-fold with a soft crease shadow at each fold; the lower third opens first, then the upper, each on its own hinge, the paper never bending where it is not folded.',
    built: true,
  },
  // ── Tap & Reveal ──
  {
    key: 'instant-camera', name: 'Instant Camera', triggers: ['tap'],
    photos: { count: 1, shape: 'square', label: 'the photograph in the instant camera' }, words: 'line', aspect: 1.45, width: 60, duration: 2600, minTier: 'STANDARD',
    realism: 'A matte body with one lens ring; a white flash that opens to 140% and is gone in 500ms; the print slides out on a slow ease and develops from grey over two seconds.',
    built: true,
    holds: { photo: true, words: true },
  },
  {
    key: 'ring-box', name: 'Ring Box', triggers: ['tap'],
    photos: { count: 0, shape: 'square', label: '' }, words: 'names', aspect: 0.9, width: 56, duration: 1400, minTier: 'STANDARD',
    realism: 'A velvet box on a hinge at the back; the lid opens past vertical and settles; the names come up in the cushion.',
    built: true,
  },
  {
    key: 'light', name: 'Magic Light', triggers: ['tap'],
    photos: { count: 1, shape: 'landscape', label: 'the photograph the light reveals' }, words: 'line', aspect: 0.75, width: 80, duration: 1200, minTier: 'STANDARD',
    realism: 'One soft radial flash from the point tapped, never a sparkle; what it reveals fades in as the light fades.',
    built: true,
    variants: { flash: 'Magic Flash' },
  },
  {
    key: 'bloom', name: 'Flower Bloom', triggers: ['tap'],
    photos: { count: 1, shape: 'square', label: 'the photograph inside the flower' }, words: 'line', aspect: 1, width: 64, duration: 1800, minTier: 'STANDARD',
    realism: 'Petals as paths in one design colour, opening on staggered eases from the centre; the photograph is behind them from the start.',
    built: true,
    holds: { photo: true },
  },
  {
    key: 'candle', name: 'Candle', triggers: ['tap'],
    photos: { count: 0, shape: 'square', label: '' }, words: 'line', aspect: 1.1, width: 56, duration: 1500, minTier: 'STANDARD',
    realism: 'A taper with a wick; the flame lights with a small flicker and the message warms in around it. The cake variant blows it out instead.',
    built: true,
    variants: { cake: 'Birthday Cake' },
  },
  {
    key: 'gift', name: 'Gift Box', triggers: ['tap'],
    photos: { count: 1, shape: 'square', label: 'the photograph in the gift box' }, words: 'line', aspect: 1.1, width: 60, duration: 1600, minTier: 'STANDARD',
    realism: 'A lidded box with a satin ribbon; the lid lifts and tips back; what is inside rises. Mystery shakes three times first; Holiday releases the ribbon first.',
    built: true,
    variants: { mystery: 'Mystery Gift', holiday: 'Holiday Gift' },
  },
  {
    key: 'frame', name: 'Photo Frame', triggers: ['tap'],
    photos: { count: 1, shape: 'portrait', label: 'the photograph in the frame' }, aspect: 1.25, width: 64, duration: 1200, minTier: 'STANDARD',
    realism: 'A thin frame in the accent; the photograph reveals with a soft wipe from the top, as if a cloth were drawn off it.',
    built: true,
    holds: { photo: true },
  },
  // ── Swipe & Pull ──
  {
    key: 'pull-card', name: 'Pull Invitation', triggers: ['swipe'], swipe: 'up',
    photos: { count: 0, shape: 'landscape', label: '' }, words: 'lines', aspect: 0.9, width: 78, duration: 1200, minTier: 'STANDARD',
    realism: 'The card follows the finger out of the envelope, its shadow deepening as more of it is out; let go early and it slides back.',
    built: true,
    holds: { photo: true, words: true },
  },
  {
    key: 'scratch', name: 'Scratch Reveal', triggers: [], mechanic: 'rub',
    photos: { count: 1, shape: 'landscape', label: 'the photograph under the scratch card' }, words: 'line', aspect: 0.7, width: 80, duration: 800, minTier: 'COMPLETE',
    realism: 'A foil layer with a brushed sheen on a canvas; the finger clears it in a soft-edged stroke; at six tenths cleared the rest falls away.',
    built: true,
  },
  {
    key: 'sticker', name: 'Peel Sticker', triggers: ['swipe'], swipe: 'left',
    photos: { count: 1, shape: 'square', label: 'the photograph under the sticker' }, words: 'line', aspect: 1, width: 60, duration: 1200, minTier: 'STANDARD',
    realism: 'A corner curls with a lighter back face and a shadow under the curl; the peel follows the finger across.',
    built: true,
    holds: { photo: true },
  },
  {
    key: 'frost', name: 'Frosted Glass', triggers: [], mechanic: 'rub',
    photos: { count: 1, shape: 'portrait', label: 'the photograph behind the glass' }, aspect: 1.25, width: 80, duration: 800, minTier: 'COMPLETE',
    realism: 'The scratch engine with a blur mask: the photograph is there, out of focus, and comes clear wherever the finger passes.',
    built: true,
    holds: { photo: true },
  },
  {
    key: 'scroll', name: 'Scroll', triggers: ['swipe', 'tap'], swipe: 'down',
    photos: { count: 0, shape: 'landscape', label: '' }, words: 'lines', aspect: 1.2, width: 74, duration: 1800, minTier: 'STANDARD',
    realism: 'Paper rolled on a rod that unfurls downward with the finger, the roll shrinking as it goes; the diploma variant ties it with a ribbon first.',
    built: true,
    holds: { words: true },
    variants: { diploma: 'Graduation Scroll' },
  },
  // ── Photo Moments ──
  {
    key: 'polaroid-stack', name: 'Polaroid Stack', triggers: ['tap'],
    photos: { count: 3, shape: 'square', label: 'a photograph in the stack' }, words: 'lines', aspect: 1.1, width: 80, duration: 1600, minTier: 'STANDARD',
    realism: 'Three prints squared in a pile; they slide out into a fan, each turning a few degrees and settling with a paper shadow. The words are written on the top print.',
    built: true,
    holds: { photo: true, words: true },
  },
  {
    key: 'film-strip', name: 'Film Strip', triggers: [], mechanic: 'browse', swipe: 'left',
    photos: { count: 6, shape: 'landscape', label: 'a frame on the film strip' }, aspect: 0.55, width: 100, duration: 600, minTier: 'STANDARD',
    realism: 'A sprocketed strip that snaps frame to frame under the finger; the frames are the photographs, dark between.',
    built: true,
    holds: { photo: true, words: true },
  },
  {
    key: 'album', name: 'Photo Album', triggers: [], mechanic: 'browse', swipe: 'left',
    photos: { count: 6, shape: 'portrait', label: 'a photograph in the album' }, words: 'lines', aspect: 0.8, width: 92, duration: 1000, minTier: 'STANDARD',
    realism: 'A page turns on the spine in perspective with a fold shadow that sweeps across; the next spread is under it from the start.',
    built: true,
    holds: { photo: true, words: true },
  },
  {
    key: 'photo-booth', name: 'Photo Booth', triggers: ['tap'],
    photos: { count: 3, shape: 'square', label: 'a photograph on the booth strip' }, aspect: 1.4, width: 56, duration: 3200, minTier: 'COMPLETE',
    realism: 'A count of three, one flash each, then the strip drops from the slot on a slow ease and swings once.',
    built: true,
    holds: { photo: true },
  },
  {
    key: 'projector', name: 'Projector', triggers: ['tap'],
    photos: { count: 1, shape: 'landscape', label: 'the picture in the projector beam' }, aspect: 0.8, width: 90, duration: 1600, minTier: 'COMPLETE',
    realism: 'A reel projector that warms up: the lamp comes on, the beam widens in a haze, and the picture resolves inside it.',
    built: true,
    holds: { photo: true },
  },
  {
    key: 'carousel', name: 'Photo Carousel', triggers: [], mechanic: 'browse', swipe: 'left',
    photos: { count: 6, shape: 'portrait', label: 'a photograph in the carousel' }, words: 'lines', aspect: 1.1, width: 92, duration: 700, minTier: 'STANDARD',
    realism: 'Photographs that slide to the next under the finger with a slight scale on the one in front; nothing spins.',
    built: true,
    holds: { photo: true, words: true },
  },
  // ── Occasion ──
  {
    key: 'baby', name: 'Baby Reveal', triggers: ['tap'],
    photos: { count: 1, shape: 'square', label: 'the photograph the reveal shows' }, words: 'line', aspect: 1, width: 64, duration: 1600, minTier: 'STANDARD',
    realism: 'A soft cloud that parts in two on a slow ease, the photograph and the announcement behind it.',
    built: true,
  },
  {
    key: 'cheers', name: 'Champagne Cheers', triggers: ['tap'],
    photos: { count: 0, shape: 'square', label: '' }, words: 'line', aspect: 0.9, width: 60, duration: 1400, minTier: 'STANDARD',
    realism: 'Two flutes that meet on a real arc, one ring of light at the touch, and the words come up beneath them.',
    built: true,
  },
  // ── Surprise ──
  {
    key: 'hold', name: 'Hold to Reveal', triggers: ['hold'],
    photos: { count: 1, shape: 'landscape', label: 'the photograph the hold reveals' }, words: 'line', aspect: 0.75, width: 80, duration: 1200, minTier: 'COMPLETE',
    realism: 'A thin ring fills while the finger stays; let go early and it drains back; at the top the veil lifts.',
    built: true,
  },
  {
    key: 'code', name: 'Secret Code', triggers: [], mechanic: 'keys',
    photos: { count: 1, shape: 'landscape', label: 'the photograph the code unlocks' }, words: 'code', aspect: 0.9, width: 70, duration: 1000, minTier: 'COMPLETE',
    realism: 'Four dials; a wrong code shakes once, two degrees; the right one opens a latch.',
    built: true,
  },
  {
    key: 'puzzle', name: 'Puzzle Reveal', triggers: [], mechanic: 'drag',
    photos: { count: 1, shape: 'square', label: 'the photograph the puzzle makes' }, aspect: 1, width: 80, duration: 900, minTier: 'COMPLETE',
    realism: 'Nine pieces of the one photograph, dragged into place and snapping within eight percent; the last piece settles the whole.',
    built: true,
    holds: { photo: true },
  },
  {
    key: 'flip', name: 'Flip Card', triggers: ['tap'],
    photos: { count: 1, shape: 'portrait', label: 'the photograph on the card' }, words: 'lines', aspect: 1.35, width: 64, duration: 1000, minTier: 'COMPLETE',
    realism: 'A card that turns on its vertical axis in perspective, the back face carrying the words; one turn, no wobble.',
    built: true,
    holds: { photo: true, words: true },
  },
];

/** Every scene's key, for the schema: a document may name no moment the library has not got. */
export const MOMENT_KEYS = MOMENTS.map((m) => m.key) as [MomentKey, ...MomentKey[]];

/**
 * The photographed parts the scenes are built from.
 *
 * A scene used to be drawn in the stylesheet — gradients for wood, a radial
 * for a lens — and read as a diagram of the thing. These are photographs of
 * the things themselves, cut out on their alpha, shipped under /moments and
 * moved by the same stylesheet: a door leaf still swings on its hinge, a
 * curtain still gathers, the print still rises out of the slot. Each part
 * is measured once, here, so the stylesheet can place what goes inside it:
 * the print's picture window, the arch's doorway.
 *
 * A design may bring its own (DesignArt.parts, by this key): a replacement
 * is drawn in the same box, so it has to keep the same proportions and, for
 * a part with a window in it, the window where it is. Blank keeps the one
 * shipped.
 */
export type PartKey = 'instant-camera/body' | 'instant-camera/print' | 'curtains/panel' | 'curtains/pelmet' | 'doors/leaf-l' | 'doors/leaf-r' | 'doors/arch' | 'seal/wax' | 'scratch/foil';
export type PartDef = {
  key: PartKey;
  scene: MomentKey;
  /** how the admin names it */
  label: string;
  /** what a replacement has to keep */
  hint: string;
  /** the shipped picture */
  url: string;
  /** width over height of the shipped picture */
  aspect: number;
  /** the see-through opening in it — a picture window, a doorway — as a share of its box, in percent */
  hole?: { left: number; top: number; width: number; height: number };
};
export const MOMENT_PARTS: PartDef[] = [
  { key: 'instant-camera/body', scene: 'instant-camera', label: 'Instant camera — the body', hint: 'The camera seen from the front, on a transparent background, the film slot along its top edge.', url: '/moments/instant-camera/body.webp', aspect: 1.172 },
  { key: 'instant-camera/print', scene: 'instant-camera', label: 'Instant print — the blank frame', hint: 'A blank instant print, the picture area see-through, on a transparent background; the photograph is drawn into the window where this one has it.', url: '/moments/instant-camera/print.webp', aspect: 0.739, hole: { left: 5.99, top: 6.91, width: 88.15, height: 70.78 } },
  { key: 'curtains/panel', scene: 'curtains', label: 'Curtains — one panel', hint: 'One curtain panel hanging straight, tall, on a transparent background; the right-hand panel is its mirror.', url: '/moments/curtains/panel.webp', aspect: 0.403 },
  { key: 'curtains/pelmet', scene: 'curtains', label: 'Curtains — the pelmet', hint: 'The pelmet across the top, wide, its lower edge on a transparent background.', url: '/moments/curtains/pelmet.webp', aspect: 4.465 },
  { key: 'doors/leaf-l', scene: 'doors', label: 'Doors — the left leaf', hint: 'The left leaf of the pair, hinged at its left edge, on a transparent background.', url: '/moments/doors/leaf-l.webp', aspect: 0.337 },
  { key: 'doors/leaf-r', scene: 'doors', label: 'Doors — the right leaf', hint: 'The right leaf of the pair, hinged at its right edge, on a transparent background.', url: '/moments/doors/leaf-r.webp', aspect: 0.324 },
  { key: 'doors/arch', scene: 'doors', label: 'Church doors — the stone arch', hint: 'The stone surround, the doorway see-through, on a transparent background; the leaves hang in the doorway where this one has it.', url: '/moments/doors/arch.webp', aspect: 0.67, hole: { left: 20.79, top: 15.26, width: 58.55, height: 76.63 } },
  { key: 'seal/wax', scene: 'seal', label: 'Wax seal — the wax', hint: 'The pressed wax, straight on, its centre plain for the monogram, on a transparent background.', url: '/moments/seal/wax.webp', aspect: 0.969 },
  { key: 'scratch/foil', scene: 'scratch', label: 'Scratch card — the foil', hint: 'The foil as a texture, square, edge to edge, no transparency.', url: '/moments/scratch/foil.webp', aspect: 1 },
];
export const PART_BY_KEY: Record<PartKey, PartDef> = Object.fromEntries(MOMENT_PARTS.map((p) => [p.key, p])) as Record<PartKey, PartDef>;
/** The picture for one of a scene's parts: the design's own where it brought one, else the one shipped. */
export function partUrl(key: PartKey, own?: Record<string, string>): string {
  return own?.[key] || PART_BY_KEY[key].url;
}
/** Height over width of the box a scene lands in: the church doors take their stone arch's proportions. */
export function aspectOf(key: MomentKey, variant?: string): number {
  if (key === 'doors' && variant === 'church') return 1134 / 760;
  return MOMENT_BY_KEY[key]?.aspect ?? 1;
}
/** The scenes that stand on photographed parts, by variant — the plain doors and the plain panels are drawn. */
export const PARTED: Partial<Record<MomentKey, boolean>> = { 'instant-camera': true, 'polaroid-stack': true, curtains: true, doors: true, seal: true, scratch: true };


export const MOMENT_BY_KEY: Record<MomentKey, MomentDef> = Object.fromEntries(MOMENTS.map((m) => [m.key, m])) as Record<MomentKey, MomentDef>;

/** One row of a shelf, as she listed it: the guest's action and what happens, and the scene it is drawn with. */
export type ShelfEntry = {
  key: MomentKey;
  variant?: string;
  /** the name on this shelf: "Church Doors" for the doors scene's church variant */
  name: string;
  action: string;
  happens: string;
  /** the Occasion shelf: the occasions it is for; blank means any */
  occasions?: Occasion[];
};

export const SHELVES: Record<Shelf, ShelfEntry[]> = {
  opening: [
    { key: 'envelope', name: 'Open Envelope', action: 'Tap envelope', happens: 'Flap opens → invitation slides out → experience begins' },
    { key: 'seal', name: 'Break Wax Seal', action: 'Tap seal', happens: 'Seal breaks → envelope opens → invitation reveals' },
    { key: 'ribbon', name: 'Untie Ribbon', action: 'Pull ribbon end', happens: 'Bow loosens → ribbon falls away → cover appears' },
    { key: 'curtains', name: 'Open Curtains', action: 'Swipe curtains apart', happens: 'Fabric follows finger → invitation is revealed' },
    { key: 'doors', name: 'Open Doors', action: 'Tap doors', happens: 'Double doors swing outward → invitation appears behind' },
    { key: 'capiz', name: 'Capiz Opening', action: 'Tap center', happens: 'Capiz panels elegantly fold outward → invitation reveals' },
    { key: 'letter', name: 'Unfold Letter', action: 'Tap folded paper', happens: 'Paper unfolds in stages → invitation appears' },
  ],
  tap: [
    { key: 'instant-camera', name: 'Instant Camera', action: 'Tap camera', happens: 'Flash → Polaroid slides out → photo develops' },
    { key: 'ring-box', name: 'Ring Box', action: 'Tap box', happens: 'Lid opens → ring, names or date appear' },
    { key: 'light', name: 'Magic Light', action: 'Tap', happens: 'Soft flash spreads outward → hidden content appears' },
    { key: 'bloom', name: 'Flower Bloom', action: 'Tap flower', happens: 'Petals open → photo or message reveals' },
    { key: 'candle', name: 'Light a Candle', action: 'Tap candle', happens: 'Flame lights → surrounding message fades in' },
    { key: 'gift', name: 'Gift Box', action: 'Tap box', happens: 'Lid opens → surprise content rises out' },
    { key: 'frame', name: 'Photo Frame', action: 'Tap frame', happens: 'Photo smoothly reveals inside the frame' },
  ],
  swipe: [
    { key: 'pull-card', name: 'Pull Invitation', action: 'Drag card upward', happens: 'Card physically follows finger out of envelope' },
    { key: 'scratch', name: 'Scratch Reveal', action: 'Rub screen', happens: 'Covering disappears → hidden photo or message appears' },
    { key: 'sticker', name: 'Peel Sticker', action: 'Drag corner', happens: 'Sticker curls away → surprise underneath reveals' },
    { key: 'ribbon', name: 'Pull Ribbon', action: 'Drag ribbon', happens: 'Ribbon progressively unties → content opens' },
    { key: 'frost', name: 'Clear Frosted Glass', action: 'Swipe or rub', happens: 'Frost disappears wherever finger passes → photo reveals' },
    { key: 'scroll', name: 'Unroll Scroll', action: 'Swipe downward', happens: 'Paper follows finger and gradually unfurls' },
    { key: 'curtains', variant: 'panels', name: 'Slide Panels', action: 'Swipe apart', happens: 'Two decorative panels move outward → content appears' },
  ],
  photo: [
    { key: 'instant-camera', name: 'Instax Camera', action: 'Tap camera', happens: 'Flash → physical-looking Polaroid emerges → photo develops' },
    { key: 'polaroid-stack', name: 'Polaroid Stack', action: 'Tap stack', happens: 'Photos slide or scatter individually into position' },
    { key: 'film-strip', name: 'Film Strip', action: 'Swipe horizontally', happens: 'Guest browses photos like a film reel' },
    { key: 'album', name: 'Photo Album', action: 'Swipe page', happens: 'Album page turns → next photos appear' },
    { key: 'photo-booth', name: 'Photo Booth', action: 'Tap shutter', happens: 'Countdown → flash → photo strip drops out' },
    { key: 'projector', name: 'Projector', action: 'Tap projector', happens: 'Projector turns on → image or video appears in its beam' },
    { key: 'carousel', name: 'Photo Carousel', action: 'Swipe', happens: 'Photos smoothly rotate or slide to the next memory' },
  ],
  occasion: [
    { key: 'ring-box', name: 'Ring Box', action: 'Tap', happens: 'Box opens → wedding or proposal names reveal', occasions: ['WEDDING', 'ENGAGEMENT', 'ANNIVERSARY'] },
    { key: 'doors', variant: 'church', name: 'Church Doors', action: 'Tap', happens: 'Doors open → wedding or christening ceremony details appear', occasions: ['WEDDING', 'CHRISTENING', 'COMMUNION'] },
    { key: 'candle', variant: 'cake', name: 'Birthday Cake', action: 'Tap candle', happens: 'Candle goes out → birthday greeting appears', occasions: ['KIDS_BIRTHDAY', 'MILESTONE_BIRTHDAY', 'DEBUT'] },
    { key: 'baby', name: 'Baby Reveal', action: 'Tap gift or cloud', happens: 'Baby announcement or photo reveals', occasions: ['BABY_SHOWER', 'CHRISTENING'] },
    { key: 'scroll', variant: 'diploma', name: 'Graduation Scroll', action: 'Pull ribbon', happens: "Diploma unrolls → graduate's details appear", occasions: ['GRADUATION'] },
    { key: 'cheers', name: 'Champagne Cheers', action: 'Tap glasses', happens: 'Glasses clink → anniversary or celebration details reveal', occasions: ['ANNIVERSARY', 'ENGAGEMENT', 'CORPORATE', 'REUNION', 'HOUSEWARMING'] },
    { key: 'gift', variant: 'holiday', name: 'Holiday Gift', action: 'Tap present', happens: 'Ribbon releases → box opens → holiday message appears' },
  ],
  surprise: [
    { key: 'scratch', name: 'Scratch to Reveal', action: 'Scratch or rub', happens: 'Hidden message, photo or announcement gradually appears' },
    { key: 'hold', name: 'Hold to Reveal', action: 'Press and hold', happens: 'Progress fills → surprise appears when completed' },
    { key: 'code', name: 'Secret Code', action: 'Enter code', happens: 'Correct code unlocks → hidden content reveals' },
    { key: 'puzzle', name: 'Puzzle Reveal', action: 'Tap or drag pieces', happens: 'Pieces assemble → complete photo or message appears' },
    { key: 'flip', name: 'Flip Card', action: 'Tap card', happens: 'Card rotates → surprise displayed on reverse' },
    { key: 'gift', variant: 'mystery', name: 'Mystery Gift', action: 'Tap box', happens: 'Box shakes → opens → surprise reveals' },
    { key: 'light', variant: 'flash', name: 'Magic Flash', action: 'Tap', happens: 'Quick soft flash fills opening → surprise content emerges' },
  ],
};

/** The scene a shelf row is drawn with. */
export const momentOf = (entry: ShelfEntry): MomentDef => MOMENT_BY_KEY[entry.key];

/** The shelves a scene sits on, for "also under …" in the sheet. */
export function shelvesOf(key: MomentKey): Shelf[] {
  return SHELF_KEYS.filter((s) => SHELVES[s].some((e) => e.key === key));
}

/** The name a placed moment goes by: the shelf row's where a variant names it, else the scene's. */
export function momentName(key: MomentKey, variant?: string): string {
  const def = MOMENT_BY_KEY[key];
  if (!def) return key;
  if (variant && def.variants?.[variant]) return def.variants[variant];
  return def.name;
}

/** The trigger a placed moment answers to: its own where it is one the scene takes, else the scene's first. */
export function triggerOf(key: MomentKey, chosen?: Trigger): Trigger | undefined {
  const def = MOMENT_BY_KEY[key];
  if (!def) return chosen;
  if (chosen && def.triggers.includes(chosen)) return chosen;
  return def.triggers[0];
}

/** The hint under a moment, by how it is opened, in the guest's language. */
export function momentHint(key: MomentKey, trigger: Trigger | undefined, lang: 'en' | 'tl'): string {
  const def = MOMENT_BY_KEY[key];
  const tl = lang === 'tl';
  if (def?.mechanic === 'rub') return tl ? 'Kuskusin para makita' : 'Rub to reveal';
  if (def?.mechanic === 'drag') return tl ? 'Ayusin ang mga piraso' : 'Put the pieces together';
  if (def?.mechanic === 'keys') return tl ? 'Ilagay ang code' : 'Enter the code';
  if (def?.mechanic === 'browse') return tl ? 'I-swipe para sa susunod' : 'Swipe for the next';
  if (trigger === 'hold') return tl ? 'Pindutin nang matagal' : 'Press and hold';
  if (trigger === 'swipe') {
    switch (def?.swipe) {
      case 'apart': return tl ? 'I-swipe pahiwalay' : 'Swipe apart';
      case 'down': return tl ? 'I-swipe pababa' : 'Swipe down';
      case 'left': case 'right': return tl ? 'I-swipe' : 'Swipe';
      default: return tl ? 'I-swipe pataas' : 'Swipe up';
    }
  }
  return tl ? 'I-tap para buksan' : 'Tap to open';
}

/** Every moment is on a shelf and every shelf has its seven: the library's own check, also run by the tests. */
export function libraryHolds(): string[] {
  const faults: string[] = [];
  for (const s of SHELF_KEYS) {
    if (SHELVES[s].length !== 7) faults.push(`${s} has ${SHELVES[s].length} rows, not 7`);
    for (const e of SHELVES[s]) {
      const def = MOMENT_BY_KEY[e.key];
      if (!def) faults.push(`${s}: ${e.key} is not a scene`);
      else if (e.variant && !def.variants?.[e.variant]) faults.push(`${s}: ${e.key} has no variant ${e.variant}`);
    }
  }
  for (const m of MOMENTS) if (!shelvesOf(m.key).length) faults.push(`${m.key} is on no shelf`);
  return faults;
}
