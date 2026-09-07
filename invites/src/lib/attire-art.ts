/**
 * The drawn figures on the dress code page — the designer's fashion plates,
 * cut into two layers each: the garment, as its shading alone, recoloured on
 * the page to whatever the couple picked; and the rest — face, hair, shirt,
 * tie, shoes, bag — as it was drawn. Both live in `public/attire/`.
 *
 * Drawings are kept by the kind of garment they show. The page asks for the
 * kinds the couple ticked (a suit, a barong, a long gown, a cocktail dress…)
 * and gets the drawings that exist for them, falling back to the nearest kind
 * that does — a barong falls back to the open-collared suit until a barong is
 * drawn — so a new drawing is one file pair and one line here.
 */
export type Drawing = { id: string; w: number; h: number };

const d = (id: string, w: number, h = 940): Drawing => ({ id, w, h });

/** Gentlemen, by kind: `tie` a suit with a tie, `open` a suit worn open at the collar. */
export const GENTS_ART: Record<string, Drawing[]> = {
  tie: [d('suit-1', 276), d('suit-2', 276), d('suit-3', 272)],
  open: [d('suit-4', 288)],
};

/** Ladies, by kind: `long` a long gown, in five silhouettes. */
export const LADIES_ART: Record<string, Drawing[]> = {
  long: [d('gown-1', 256), d('gown-2', 228), d('gown-3', 224), d('gown-4', 236), d('gown-5', 270)],
};

/** The kinds each attire item calls for, best first; the first with drawings is used. */
const GENTS_KINDS: Record<string, string[]> = {
  suit: ['tie'], tuxedo: ['tie'], businessSuit: ['tie'], coat: ['tie'], tie: ['tie'], bowTie: ['tie'],
  blazer: ['open'], barong: ['barong', 'open'], longSleeves: ['open'], polo: ['polo', 'open'], buttonDown: ['open'],
  chinos: ['polo', 'open'], darkJeans: ['polo', 'open'], themed: ['open'], muted: ['tie'],
};
const LADIES_KINDS: Record<string, string[]> = {
  longGown: ['long'], cocktail: ['cocktail', 'long'], separates: ['separates', 'long'], filipiniana: ['filipiniana', 'long'],
  midi: ['midi', 'long'], sundayDress: ['midi', 'long'], jumpsuit: ['jumpsuit', 'long'], blouseSkirt: ['separates', 'long'],
  blouseTrousers: ['separates', 'long'], partyDress: ['cocktail', 'long'], businessDress: ['midi', 'long'], blazer: ['separates', 'long'],
  themed: ['long'], muted: ['long'],
};

/**
 * `count` drawings for the items ticked: the pool is every drawing of every
 * kind asked for, in the order asked, cycled — so four colours on "suit" and
 * "long sleeves" give the three tied suits and the open one, and four colours
 * on "suit" alone give the three and the first again, in its fourth colour.
 */
export function pickDrawings(group: 'gents' | 'ladies', ticked: string[], count: number): Drawing[] {
  const art = group === 'gents' ? GENTS_ART : LADIES_ART;
  const kindsOf = group === 'gents' ? GENTS_KINDS : LADIES_KINDS;
  const fallback = group === 'gents' ? 'tie' : 'long';
  const kinds: string[] = [];
  for (const item of ticked) {
    const kind = (kindsOf[item] ?? []).find((k) => art[k]?.length);
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  if (!kinds.length) kinds.push(fallback);
  const pool = kinds.flatMap((k) => art[k]);
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}
