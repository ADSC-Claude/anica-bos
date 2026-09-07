import type { Occasion } from '@prisma/client';
import type { Lang } from './copy';

/**
 * What guests are asked to wear, as lists to tick rather than sentences to
 * type: the pieces a gentleman or a lady might be asked for at each kind of
 * occasion, and the things they are kindly asked to leave at home. The dress
 * code form offers the lists that fit the occasion; the page prints what was
 * ticked, in English or Tagalog, and draws a crossed icon for each "avoid".
 */
export type AttireItem = { value: string; en: string; tl: string; icon?: string; /** the dress codes this piece suits; none listed suits them all */ for?: string[] };

/**
 * The dress codes a couple picks from — one, or two that go together, a
 * formal wedding that welcomes a cocktail dress. Each piece of clothing below
 * says which of these it suits, so the form offers only what fits the code
 * picked and the guest is never shown a suit under "casual".
 */
export const ATTIRES: { value: string; en: string; tl: string }[] = [
  { value: 'formal', en: 'Formal', tl: 'Formal' },
  { value: 'semiFormal', en: 'Semi-formal', tl: 'Semi-formal' },
  { value: 'cocktail', en: 'Cocktail', tl: 'Cocktail' },
  { value: 'filipiniana', en: 'Filipiniana & Barong', tl: 'Filipiniana at Barong' },
  { value: 'business', en: 'Business', tl: 'Business' },
  { value: 'smartCasual', en: 'Smart casual', tl: 'Smart casual' },
  { value: 'casual', en: 'Casual', tl: 'Casual' },
  { value: 'themed', en: 'Themed', tl: 'Themed' },
];
export function attireName(key: string, lang: Lang): string {
  const a = ATTIRES.find((x) => x.value === key);
  return a ? a[lang] : '';
}

const F = 'formal', SF = 'semiFormal', CK = 'cocktail', FP = 'filipiniana', BZ = 'business', SC = 'smartCasual', CS = 'casual', TH = 'themed';

const GENTS: Record<string, AttireItem> = {
  suit: { value: 'suit', en: 'Suit', tl: 'Suit', for: [F, SF, BZ, CK] },
  tuxedo: { value: 'tuxedo', en: 'Tuxedo', tl: 'Tuxedo', for: [F] },
  coat: { value: 'coat', en: 'Coat', tl: 'Amerikana', for: [F, SF, CK, BZ] },
  barong: { value: 'barong', en: 'Barong Tagalog', tl: 'Barong Tagalog', for: [F, SF, FP] },
  longSleeves: { value: 'longSleeves', en: 'Long sleeves', tl: 'Long sleeves', for: [F, SF, SC, BZ, FP] },
  tie: { value: 'tie', en: 'Tie', tl: 'Kurbata', for: [F, SF, BZ] },
  bowTie: { value: 'bowTie', en: 'Bow tie', tl: 'Bow tie', for: [F] },
  slacks: { value: 'slacks', en: 'Slacks', tl: 'Slacks', for: [F, SF, SC, BZ, FP] },
  dressShoes: { value: 'dressShoes', en: 'Dress shoes', tl: 'Pormal na sapatos', for: [F, SF, BZ, CK, FP] },
  polo: { value: 'polo', en: 'Polo shirt', tl: 'Polo shirt', for: [SC, CS] },
  buttonDown: { value: 'buttonDown', en: 'Button-down shirt', tl: 'Button-down', for: [SF, SC, CS] },
  chinos: { value: 'chinos', en: 'Chinos', tl: 'Chinos', for: [SC, CS] },
  darkJeans: { value: 'darkJeans', en: 'Dark jeans', tl: 'Madilim na maong', for: [CS] },
  loafers: { value: 'loafers', en: 'Loafers', tl: 'Loafers', for: [SF, SC, CS] },
  sneakers: { value: 'sneakers', en: 'Clean sneakers', tl: 'Malinis na sneakers', for: [CS] },
  businessSuit: { value: 'businessSuit', en: 'Business suit', tl: 'Business suit', for: [BZ, F] },
  blazer: { value: 'blazer', en: 'Blazer', tl: 'Blazer', for: [BZ, SF, SC, CK] },
  themed: { value: 'themed', en: 'Themed costume', tl: 'Kasuotang pantema', for: [TH] },
  muted: { value: 'muted', en: 'Dark or muted colours', tl: 'Madilim o malamlam na kulay' },
};

const LADIES: Record<string, AttireItem> = {
  longGown: { value: 'longGown', en: 'Long gown', tl: 'Mahabang gown', for: [F, FP] },
  cocktail: { value: 'cocktail', en: 'Cocktail dress', tl: 'Cocktail dress', for: [CK, SF, F] },
  separates: { value: 'separates', en: 'Elegant separates', tl: 'Eleganteng separates', for: [F, SF, CK, SC] },
  filipiniana: { value: 'filipiniana', en: 'Filipiniana or terno', tl: 'Filipiniana o terno', for: [FP, F] },
  midi: { value: 'midi', en: 'Midi dress', tl: 'Midi dress', for: [SF, SC, CK, CS, BZ] },
  sundayDress: { value: 'sundayDress', en: 'Sunday dress', tl: 'Pang-Linggong bestida', for: [SC, CS, SF] },
  jumpsuit: { value: 'jumpsuit', en: 'Jumpsuit', tl: 'Jumpsuit', for: [SF, SC, CK, CS] },
  blouseSkirt: { value: 'blouseSkirt', en: 'Blouse and skirt', tl: 'Blusa at palda', for: [SC, BZ, CS, SF] },
  blouseTrousers: { value: 'blouseTrousers', en: 'Blouse and trousers', tl: 'Blusa at slacks', for: [SC, BZ, CS] },
  heels: { value: 'heels', en: 'Heels or dressy flats', tl: 'Takong o pormal na flats', for: [F, SF, CK, BZ, FP] },
  partyDress: { value: 'partyDress', en: 'Party dress', tl: 'Bestidang pang-party', for: [CS, SC, SF, CK] },
  blazer: { value: 'blazer', en: 'Blazer', tl: 'Blazer', for: [BZ, SC] },
  businessDress: { value: 'businessDress', en: 'Business dress', tl: 'Business dress', for: [BZ, SF] },
  themed: { value: 'themed', en: 'Themed costume', tl: 'Kasuotang pantema', for: [TH] },
  muted: { value: 'muted', en: 'Dark or muted colours', tl: 'Madilim o malamlam na kulay' },
};

const AVOID: Record<string, AttireItem> = {
  white: { value: 'white', en: 'White', tl: 'Puti', icon: 'gown' },
  bright: { value: 'bright', en: 'Very bright colours', tl: 'Napakatingkad na kulay', icon: 'dress' },
  red: { value: 'red', en: 'Red', tl: 'Pula', icon: 'dress' },
  black: { value: 'black', en: 'Black', tl: 'Itim', icon: 'suit' },
  casual: { value: 'casual', en: 'Casual wear (e.g. jeans, sneakers)', tl: 'Pang-araw-araw (maong, sneakers)', icon: 'jeans' },
  sports: { value: 'sports', en: 'Sports attire', tl: 'Pang-sports', icon: 'tee' },
  slippers: { value: 'slippers', en: 'Slippers', tl: 'Tsinelas', icon: 'slipper' },
  prints: { value: 'prints', en: 'Prints & loud patterns', tl: 'Print at matingkad na disenyo', icon: 'pattern' },
  shorts: { value: 'shorts', en: 'Shorts', tl: 'Shorts', icon: 'shorts' },
  caps: { value: 'caps', en: 'Caps & hats', tl: 'Cap at sombrero', icon: 'cap' },
};

/** "White" is asked of guests for a different reason at each occasion. */
const WHITE_FOR: Partial<Record<Occasion, { en: string; tl: string }>> = {
  WEDDING: { en: 'White (for the bride)', tl: 'Puti (para sa bride)' },
  ANNIVERSARY: { en: 'White (for the couple)', tl: 'Puti (para sa mag-asawa)' },
  CHRISTENING: { en: 'White (for the celebrant)', tl: 'Puti (para sa bininyagan)' },
  COMMUNION: { en: 'White (for the celebrant)', tl: 'Puti (para sa celebrant)' },
};
const RED_FOR: Partial<Record<Occasion, { en: string; tl: string }>> = {
  DEBUT: { en: 'Red (for the debutante)', tl: 'Pula (para sa debutante)' },
};

type Lists = { gents: string[]; ladies: string[]; avoid: string[] };
type Defaults = Lists & { attire: string[] };

/** The lists offered at each occasion, in the order they are printed. */
const OFFERED: Record<Occasion, Lists> = {
  WEDDING: { gents: ['suit', 'coat', 'barong', 'longSleeves', 'tie', 'slacks', 'dressShoes'], ladies: ['longGown', 'cocktail', 'separates', 'filipiniana', 'heels'], avoid: ['white', 'bright', 'casual', 'sports', 'slippers', 'prints', 'shorts', 'caps'] },
  DEBUT: { gents: ['suit', 'tuxedo', 'coat', 'longSleeves', 'tie', 'bowTie', 'slacks', 'dressShoes'], ladies: ['longGown', 'cocktail', 'separates', 'midi', 'heels'], avoid: ['red', 'bright', 'casual', 'sports', 'slippers', 'prints', 'shorts'] },
  CHRISTENING: { gents: ['polo', 'buttonDown', 'longSleeves', 'barong', 'slacks', 'chinos', 'dressShoes', 'loafers'], ladies: ['sundayDress', 'midi', 'blouseSkirt', 'blouseTrousers', 'jumpsuit', 'heels'], avoid: ['white', 'casual', 'sports', 'slippers', 'shorts'] },
  KIDS_BIRTHDAY: { gents: ['polo', 'buttonDown', 'chinos', 'darkJeans', 'sneakers', 'themed'], ladies: ['partyDress', 'sundayDress', 'jumpsuit', 'blouseSkirt', 'themed'], avoid: ['sports', 'slippers'] },
  MILESTONE_BIRTHDAY: { gents: ['suit', 'coat', 'barong', 'longSleeves', 'polo', 'slacks', 'dressShoes'], ladies: ['cocktail', 'longGown', 'separates', 'midi', 'jumpsuit', 'heels'], avoid: ['casual', 'sports', 'slippers', 'prints', 'shorts'] },
  BABY_SHOWER: { gents: ['polo', 'buttonDown', 'chinos', 'slacks', 'loafers'], ladies: ['sundayDress', 'midi', 'jumpsuit', 'blouseSkirt'], avoid: ['sports', 'slippers'] },
  ANNIVERSARY: { gents: ['suit', 'coat', 'barong', 'longSleeves', 'slacks', 'dressShoes'], ladies: ['longGown', 'cocktail', 'separates', 'filipiniana', 'heels'], avoid: ['white', 'bright', 'casual', 'sports', 'slippers', 'prints'] },
  ENGAGEMENT: { gents: ['coat', 'buttonDown', 'longSleeves', 'polo', 'slacks', 'chinos', 'loafers'], ladies: ['midi', 'cocktail', 'sundayDress', 'blouseSkirt', 'jumpsuit', 'heels'], avoid: ['casual', 'sports', 'slippers', 'shorts'] },
  GRADUATION: { gents: ['suit', 'coat', 'barong', 'longSleeves', 'polo', 'slacks', 'dressShoes'], ladies: ['cocktail', 'midi', 'separates', 'filipiniana', 'heels'], avoid: ['casual', 'sports', 'slippers', 'shorts'] },
  COMMUNION: { gents: ['polo', 'buttonDown', 'longSleeves', 'barong', 'slacks', 'dressShoes'], ladies: ['sundayDress', 'midi', 'blouseSkirt', 'heels'], avoid: ['white', 'casual', 'sports', 'slippers', 'shorts'] },
  CORPORATE: { gents: ['businessSuit', 'blazer', 'longSleeves', 'tie', 'polo', 'slacks', 'chinos', 'dressShoes'], ladies: ['businessDress', 'blazer', 'blouseTrousers', 'blouseSkirt', 'midi', 'heels'], avoid: ['casual', 'sports', 'slippers', 'shorts', 'caps'] },
  HOUSEWARMING: { gents: ['polo', 'buttonDown', 'chinos', 'darkJeans', 'loafers', 'sneakers'], ladies: ['sundayDress', 'midi', 'blouseTrousers', 'jumpsuit'], avoid: ['sports'] },
  REUNION: { gents: ['polo', 'buttonDown', 'chinos', 'darkJeans', 'sneakers', 'themed'], ladies: ['sundayDress', 'midi', 'jumpsuit', 'blouseTrousers', 'themed'], avoid: ['sports'] },
  MEMORIAL: { gents: ['muted', 'longSleeves', 'barong', 'polo', 'slacks', 'dressShoes'], ladies: ['muted', 'midi', 'blouseSkirt', 'blouseTrousers', 'sundayDress'], avoid: ['bright', 'prints', 'casual', 'shorts', 'slippers'] },
};

/** What a fresh invitation starts with ticked, so the page has something to say: a dress code, two or three pieces each. */
const DEFAULTS: Record<Occasion, Defaults> = {
  WEDDING: { attire: ['formal'], gents: ['suit', 'coat', 'longSleeves'], ladies: ['longGown', 'cocktail', 'separates'], avoid: ['white', 'bright', 'casual', 'sports', 'slippers', 'prints'] },
  DEBUT: { attire: ['formal'], gents: ['suit', 'longSleeves', 'dressShoes'], ladies: ['longGown', 'cocktail'], avoid: ['casual', 'sports', 'slippers'] },
  CHRISTENING: { attire: ['smartCasual'], gents: ['polo', 'slacks'], ladies: ['sundayDress', 'midi'], avoid: ['slippers', 'shorts'] },
  KIDS_BIRTHDAY: { attire: ['casual'], gents: ['polo', 'chinos'], ladies: ['partyDress', 'sundayDress'], avoid: [] },
  MILESTONE_BIRTHDAY: { attire: ['semiFormal'], gents: ['coat', 'longSleeves', 'slacks'], ladies: ['cocktail', 'separates'], avoid: ['casual', 'slippers'] },
  BABY_SHOWER: { attire: ['smartCasual'], gents: ['polo', 'chinos'], ladies: ['sundayDress', 'midi'], avoid: [] },
  ANNIVERSARY: { attire: ['formal'], gents: ['suit', 'barong', 'dressShoes'], ladies: ['cocktail', 'longGown'], avoid: ['casual', 'slippers'] },
  ENGAGEMENT: { attire: ['semiFormal'], gents: ['longSleeves', 'slacks'], ladies: ['midi', 'cocktail'], avoid: ['slippers', 'shorts'] },
  GRADUATION: { attire: ['semiFormal'], gents: ['longSleeves', 'slacks', 'dressShoes'], ladies: ['cocktail', 'midi'], avoid: ['slippers', 'shorts'] },
  COMMUNION: { attire: ['smartCasual'], gents: ['longSleeves', 'slacks'], ladies: ['sundayDress', 'midi'], avoid: ['slippers', 'shorts'] },
  CORPORATE: { attire: ['business'], gents: ['businessSuit', 'longSleeves'], ladies: ['businessDress', 'blazer'], avoid: ['casual', 'slippers'] },
  HOUSEWARMING: { attire: ['smartCasual'], gents: ['polo', 'chinos'], ladies: ['sundayDress', 'midi'], avoid: [] },
  REUNION: { attire: ['casual'], gents: ['polo', 'chinos'], ladies: ['sundayDress', 'jumpsuit'], avoid: [] },
  MEMORIAL: { attire: ['smartCasual'], gents: ['muted', 'longSleeves'], ladies: ['muted', 'midi'], avoid: ['bright', 'prints'] },
};

/** The pieces that suit any of the dress codes picked; when fewer than three would, the whole list, so there is always a choice. */
export function itemsFor(items: AttireItem[], attires: string[]): AttireItem[] {
  if (!attires.length) return items;
  const fit = items.filter((i) => !i.for || i.for.some((a) => attires.includes(a)));
  return fit.length >= 3 ? fit : items;
}

/** The attire(s) an invitation stores — a list now, a single word in those saved before. */
export function attireKeys(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
  return typeof raw === 'string' && raw ? [raw] : [];
}

function pick(table: Record<string, AttireItem>, keys: string[], occasion: Occasion): AttireItem[] {
  return keys.map((k) => {
    const item = table[k];
    if (k === 'white' && WHITE_FOR[occasion]) return { ...item, ...WHITE_FOR[occasion] };
    if (k === 'red' && RED_FOR[occasion]) return { ...item, ...RED_FOR[occasion] };
    return item;
  });
}

export function gentsItems(occasion: Occasion): AttireItem[] { return pick(GENTS, OFFERED[occasion].gents, occasion); }
export function ladiesItems(occasion: Occasion): AttireItem[] { return pick(LADIES, OFFERED[occasion].ladies, occasion); }
export function avoidItems(occasion: Occasion): AttireItem[] { return pick(AVOID, OFFERED[occasion].avoid, occasion); }
export function attireDefaults(occasion: Occasion): Defaults { return DEFAULTS[occasion]; }

/** The ticked values of a list as its printed words, in list order. */
export function attireWords(items: AttireItem[], ticked: string[], lang: Lang): string[] {
  return items.filter((i) => ticked.includes(i.value)).map((i) => (lang === 'tl' ? i.tl : i.en));
}

/** The ticked "avoid" values with their icons, in list order. */
export function avoidTicked(occasion: Occasion, ticked: string[], lang: Lang): { value: string; label: string; icon: string }[] {
  return avoidItems(occasion)
    .filter((i) => ticked.includes(i.value))
    .map((i) => ({ value: i.value, label: lang === 'tl' ? i.tl : i.en, icon: i.icon ?? 'dress' }));
}
