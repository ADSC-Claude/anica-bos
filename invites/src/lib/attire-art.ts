/**
 * The wardrobe on the dress code page — the designer's garments, drawn flat,
 * cut into two layers each: the cloth, as its shading alone, recoloured on the
 * page to whatever the couple picked; and the parts that keep their colour —
 * a shirt and tie inside a coat, trousers under a shirt, a leg in a slit — as
 * drawn. Both live in `public/attire/`; `wardrobe.json` lists them, written
 * by the cutting script with each one's size, group and kind.
 *
 * Garments are filed by the kind they are. The page asks for the kinds the
 * couple ticked (a suit, a barong, a long gown, a cocktail dress…) and takes
 * one garment per colour, going round the kinds in turn, so a suit and a
 * barong ticked with four colours give suit, barong, suit, barong. A kind
 * with no garment yet falls back to the nearest that has one, so nothing is
 * ever blank; a new garment is one file pair and one row in the JSON.
 */
import wardrobe from './wardrobe.json';

export type Drawing = { id: string; group: 'gents' | 'ladies' | 'girls' | 'boys'; kind: string; w: number; h: number; /** a print: offered after the plain ones of its kind */ print?: boolean };
export const WARDROBE = wardrobe as Drawing[];

/** The kinds each attire item calls for, best first. Items that are not an outfit (a tie, shoes) call for none. */
const GENTS_KINDS: Record<string, string[]> = {
  suit: ['suit'], tuxedo: ['tuxedo', 'suit'], businessSuit: ['suit'], coat: ['suit'], blazer: ['suit'], bowTie: ['tuxedo'],
  barong: ['barong', 'barongShort'], longSleeves: ['shirt', 'linen'], polo: ['shirtShort', 'barongShort', 'shirt'], buttonDown: ['shirt', 'linen'],
  chinos: ['shirt', 'shirtShort', 'casual'], darkJeans: ['casual', 'shirt'], sneakers: ['casual', 'shirtShort'], themed: ['casual'], muted: ['suit'],
};
const LADIES_KINDS: Record<string, string[]> = {
  longGown: ['long'], cocktail: ['cocktail'], separates: ['blouseSkirt', 'blouseTrousers'], filipiniana: ['terno'],
  midi: ['midi'], sundayDress: ['midi', 'maxi', 'cocktail'], jumpsuit: ['jumpsuit'], blouseSkirt: ['blouseSkirt'], blouseTrousers: ['blouseTrousers'],
  partyDress: ['cocktail', 'maxi', 'midi'], businessDress: ['ladySuit', 'midi'], blazer: ['ladySuit'], themed: ['maxi', 'cocktail'], muted: ['midi', 'long'],
};
/** At a children's party the rows are the boys and the girls. */
const BOYS_KINDS: Record<string, string[]> = {
  suit: ['boyFormal'], tuxedo: ['boyFormal'], coat: ['boyFormal'], barong: ['boyBarong'], longSleeves: ['boySmart'],
  polo: ['boyCasual', 'boySmart'], buttonDown: ['boySmart'], chinos: ['boySmart'], darkJeans: ['boyCasual'], sneakers: ['boyCasual'], themed: ['boyCasual'],
};
const GIRLS_KINDS: Record<string, string[]> = { partyDress: ['girl'], sundayDress: ['girl'], jumpsuit: ['girl'], blouseSkirt: ['girl'], themed: ['girl'], longGown: ['girl'], cocktail: ['girl'], midi: ['girl'] };

const FALLBACK: Record<Drawing['group'], string> = { gents: 'suit', ladies: 'long', boys: 'boySmart', girls: 'girl' };

export function pickDrawings(group: 'gents' | 'ladies', ticked: string[], count: number, kids = false): Drawing[] {
  const g: Drawing['group'] = kids ? (group === 'gents' ? 'boys' : 'girls') : group;
  const kindsOf = g === 'gents' ? GENTS_KINDS : g === 'ladies' ? LADIES_KINDS : g === 'boys' ? BOYS_KINDS : GIRLS_KINDS;
  const art = WARDROBE.filter((d) => d.group === g);
  // plain garments first, prints after them, so a print appears only past the plain ones
  const ofKind = (k: string) => art.filter((d) => d.kind === k).sort((a, b) => Number(Boolean(a.print)) - Number(Boolean(b.print)));
  const kinds: string[] = [];
  for (const item of ticked) {
    const kind = (kindsOf[item] ?? []).find((k) => ofKind(k).length);
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  if (!kinds.length) kinds.push(ofKind(FALLBACK[g]).length ? FALLBACK[g] : art[0]?.kind ?? FALLBACK[g]);
  // round the kinds: the i-th garment is of the i-th kind, the next of that kind each time round
  return Array.from({ length: count }, (_, i) => {
    const list = ofKind(kinds[i % kinds.length]);
    return list[Math.floor(i / kinds.length) % list.length];
  }).filter(Boolean);
}
