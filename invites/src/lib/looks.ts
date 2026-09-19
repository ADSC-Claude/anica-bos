import type { Occasion, Tier } from '@prisma/client';
import type { Lang } from './copy';
import type { Fonts } from './theme';
import { tierAtLeast, RANK } from './tiers';

/**
 * A look is the voice of an invitation: the faces it is set in and the lines
 * it says under each heading. It is the third axis of a design, beside the
 * layout (what the page is built from) and the palette (its colours), and it
 * is the one a theme is most likely to disagree with — a garden wedding set
 * in a Didone with a copperplate script reads like somebody else's card. So a
 * design carries a default look and a customer can pick another; the page
 * structure and the colours stay put.
 *
 * Every line here has an English and a Tagalog reading, and every one is a
 * default: the couple's own words, where the builder collects them, win.
 */
export const LOOK_KEYS = ['heritage', 'romance', 'modern', 'editorial', 'regal'] as const;
export type LookKey = (typeof LOOK_KEYS)[number];

type Line = { en: string; tl: string };

/** The lines a look writes, by where they land. Blank means the heading stands alone. */
export type LineKey =
  | 'cover' // above the names
  | 'story'
  | 'parents' // under the parents' (or the hosts') heading
  | 'invitation'
  | 'entourage'
  | 'sponsors' // ninong and ninang
  | 'gallery'
  | 'galleryNote' // between the large photograph and the arches
  | 'galleryVideo' // written over the film
  | 'galleryClose' // under it all
  | 'venue'
  | 'interlude2' // the script lines after the way there
  | 'dressCode' // when no attire is set
  | 'dressNote'
  | 'giftThanks'
  | 'program'
  | 'social'
  | 'socialCta'
  | 'guestbook'
  | 'photos'
  | 'photosIntro'
  | 'countdown'
  | 'contact' // the small line under the heading
  | 'contactNote'
  | 'closing'
  | 'closingMessage' // the thank-you above the names
  | 'verse' // the verse on the cover page, and its source
  | 'verseRef'
  | 'moment1' // the Moment's three lines
  | 'moment2'
  | 'moment3'
  | 'gentsNote' // under the gentlemen's pieces on the dress code page
  | 'ladiesNote';

/** The headings a look names. A missing one falls back to the fixed phrase. */
export type TitleKey = 'story' | 'parents' | 'invitation' | 'entourage' | 'sponsors' | 'gallery' | 'venue' | 'getting' | 'dressCode' | 'gift' | 'program' | 'social' | 'guestbook' | 'photos' | 'rsvp' | 'contact';

export type Look = {
  /**
   * '' for `NO_LOOK` — a design that writes its own words and names no look.
   * `[data-look]` is matched exactly in the stylesheet, so a blank key styles
   * nothing, which is what a design with no look should get.
   */
  key: LookKey | '';
  name: string;
  /** One line for the picker. */
  tagline: string;
  fonts: Fonts;
  /** Between two names: the word, or the ampersand. */
  joiner: 'and' | '&';
  titles: Partial<Record<TitleKey, Line>>;
  lines: Record<LineKey, Line>;
  /**
   * Which of the above a *design* wrote for itself, by language, rather than
   * inheriting from the look — filled by `withWords`.
   *
   * It matters because the occasion rules below are about a look's stock
   * wording, never about words somebody typed for this design. A christening
   * design whose own cover line says "The christening of" must keep it; only
   * the look's inherited "The wedding of" is withheld. Without this the two
   * are indistinguishable by the time they are read.
   */
  own?: { lines?: Partial<Record<Lang, LineKey[]>>; titles?: Partial<Record<Lang, TitleKey[]>> };
};

/**
 * A look with no look in it: the shelf a design's own words stand on when the
 * design names no look.
 *
 * `withWords` folds a design's wording into a look, and a design without one
 * had nowhere to put it — so it returned the undefined it was given and every
 * fixed writing fell through to the occasion's stock line. The christening is
 * exactly that design: it withholds a look deliberately, because naming one
 * would throw its own faces away (`resolveTheme` ends with `fonts = set.fonts`),
 * and the price was that "Mom and Dad love you!" came out as the occasion's
 * "The little moments we never want to forget."
 *
 * Everything here is inert. No key, so the stylesheet matches nothing; the
 * ampersand, which is what `look?.joiner ?? '&'` already gave; no lines and no
 * titles, so every key the design does not write still falls through to the
 * occasion exactly as it did before. The fonts are never read off this object
 * — a design's faces come from its own pairing, through `resolveTheme` — and
 * are the app's own so the field is not a lie.
 */
export const NO_LOOK: Look = {
  key: '', name: '', tagline: '', joiner: '&',
  fonts: { display: 'Georgia, serif', body: 'Georgia, serif', load: [] },
  titles: {}, lines: {} as Record<LineKey, Line>,
};

const CORMORANT = "'Cormorant Garamond', 'Hoefler Text', Georgia, serif";
const CORMORANT_LOAD = 'Cormorant Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500';

/**
 * The catalogue's five. Narrower than `Look` by its key: every look listed
 * here is one a customer can pick, so it is named, and `LOOK_MIN_TIER` and
 * the fonts book can index it. Only `NO_LOOK` has the blank.
 */
export const LOOKS: (Look & { key: LookKey })[] = [
  {
    key: 'heritage',
    name: 'Heritage',
    tagline: 'Serif capitals, a copperplate script, and lines that read like a printed card.',
    fonts: { names: CORMORANT, display: CORMORANT, body: CORMORANT, script: "'Pinyon Script', 'Snell Roundhand', cursive", load: [CORMORANT_LOAD, 'Pinyon Script'] },
    joiner: 'and',
    titles: {
      story: { en: 'Our Story', tl: 'Ang Aming Kuwento' },
      parents: { en: 'Our Parents', tl: 'Ang Aming Mga Magulang' },
      invitation: { en: 'The Invitation', tl: 'Ang Paanyaya' },
      entourage: { en: 'Entourage', tl: 'Entourage' },
      gallery: { en: 'Prenup Photos', tl: 'Prenup Photos' },
      venue: { en: 'The Venue', tl: 'Ang Venue' },
      getting: { en: 'Getting There', tl: 'Papunta Roon' },
      dressCode: { en: 'Dress Code', tl: 'Dress Code' },
      gift: { en: 'Gift Request', tl: 'Tungkol sa Regalo' },
      program: { en: 'Program', tl: 'Programa' },
      social: { en: 'Snap and Share', tl: 'Kuha at I-share' },
      guestbook: { en: 'Guestbook', tl: 'Guestbook' },
      photos: { en: 'Photos From The Day', tl: 'Mga Larawan Ngayong Araw' },
      rsvp: { en: 'RSVP', tl: 'RSVP' },
      contact: { en: 'Need Assistance?', tl: 'May Tanong?' },
    },
    lines: {
      cover: { en: "You're invited", tl: 'Inaanyayahan ka' },
      story: { en: '', tl: '' },
      parents: { en: 'With their blessing', tl: 'Nang may kanilang basbas' },
      invitation: { en: 'Join us as we say I do!', tl: 'Samahan kami sa aming pag-iisang dibdib' },
      entourage: { en: 'With great love', tl: 'Nang may pagmamahal' },
      sponsors: { en: 'With love and guidance', tl: 'Nang may pagmamahal at gabay' },
      gallery: { en: "Moments we'll always cherish", tl: 'Mga sandaling laging iingatan' },
      galleryNote: { en: 'These are the moments that reminded us — it has always been you.', tl: 'Ito ang mga sandaling nagpaalala sa amin — ikaw, at ikaw pa rin.' },
      galleryVideo: { en: 'Our story in motion', tl: 'Ang aming kuwento, gumagalaw' },
      galleryClose: { en: 'Some love stories deserve to be seen.', tl: 'May mga kuwento ng pag-ibig na dapat makita.' },
      venue: { en: 'A place close to our hearts.', tl: 'Isang lugar na malapit sa aming puso.' },
      interlude2: { en: 'Where our story\ncontinues.', tl: 'Kung saan nagpapatuloy\nang aming kuwento.' },
      dressCode: { en: 'Dress the part', tl: 'Sa kasuotang nararapat' },
      dressNote: { en: 'We would love to see you in our chosen palette.', tl: 'Ikagagalak naming makita kayo sa aming napiling kulay.' },
      giftThanks: { en: 'Thank you!', tl: 'Maraming salamat!' },
      program: { en: 'A day to remember.', tl: 'Isang araw na hindi malilimutan.' },
      social: { en: 'Help us capture the love!', tl: 'Tulungan kaming makuha ang saya!' },
      socialCta: { en: 'Tag your photos with', tl: 'I-tag ang inyong mga kuha gamit ang' },
      guestbook: { en: 'Leave us a message', tl: 'Mag-iwan ng mensahe' },
      photos: { en: 'Share your snaps with us!', tl: 'I-share ang mga kuha mo!' },
      photosIntro: { en: 'Upload your photos from our special day.', tl: 'I-upload ang inyong mga larawan mula sa aming espesyal na araw.' },
      countdown: { en: 'The best is yet to come...', tl: 'Ang pinakamaganda ay paparating pa...' },
      contact: { en: "We're here to help!", tl: 'Narito kami para tumulong!' },
      contactNote: { en: 'For any questions, feel free to reach out.', tl: 'Para sa anumang tanong, huwag mag-atubiling magtanong.' },
      closing: { en: 'See you there! ♡', tl: 'Kita-kits! ♡' },
      closingMessage: { en: 'Thank you for being part of our story. We cannot wait to celebrate with you.', tl: 'Salamat sa pagiging bahagi ng aming kuwento. Hindi na kami makapaghintay na makipagdiwang sa inyo.' },
      verse: { en: 'And above all these things put on love, which binds everything together in perfect harmony.', tl: 'At higit sa lahat ng ito, magbihis kayo ng pag-ibig, na siyang buklod ng ganap na pagkakaisa.' },
      verseRef: { en: 'Colossians 3:14', tl: 'Colosas 3:14' },
      moment1: { en: 'Same horizons', tl: 'Iisang abot-tanaw' },
      moment2: { en: 'A brighter', tl: 'Mas maliwanag na' },
      moment3: { en: 'Tomorrow', tl: 'Bukas' },
      gentsNote: { en: 'Tie is optional.', tl: 'Opsyonal ang kurbata.' },
      ladiesNote: { en: 'We encourage earthy, neutral and muted tones.', tl: 'Hinihikayat namin ang mga kulay-lupa, neutral at malalamlam na tono.' },
    },
  },
  {
    key: 'romance',
    name: 'Romance',
    tagline: 'The names in a flowing script, a Playfair heading, and soft, warm lines.',
    fonts: {
      names: "'Great Vibes', 'Brush Script MT', cursive",
      display: "'Playfair Display', 'Hoefler Text', Georgia, serif",
      body: "'Lora', Georgia, serif",
      script: "'Great Vibes', 'Brush Script MT', cursive",
      load: ['Great Vibes', 'Playfair Display:ital,wght@0,400;0,500;0,600;1,400', 'Lora:ital,wght@0,400;0,500;1,400'],
    },
    joiner: '&',
    titles: {
      story: { en: 'How It Began', tl: 'Kung Paano Nagsimula' },
      parents: { en: 'Our Beloved Parents', tl: 'Ang Aming Mga Magulang' },
      invitation: { en: 'The Celebration', tl: 'Ang Pagdiriwang' },
      entourage: { en: 'Our Entourage', tl: 'Ang Aming Entourage' },
      gallery: { en: 'Us, Before the Aisle', tl: 'Kami, Bago ang Kasal' },
      venue: { en: 'The Venue', tl: 'Ang Venue' },
      getting: { en: 'Finding Your Way', tl: 'Paano Pumunta' },
      dressCode: { en: 'What to Wear', tl: 'Ano ang Isusuot' },
      gift: { en: 'A Note on Gifts', tl: 'Tungkol sa Regalo' },
      program: { en: 'The Day', tl: 'Ang Araw' },
      social: { en: 'Share the Love', tl: 'I-share ang Pagmamahal' },
      guestbook: { en: 'Well Wishes', tl: 'Mga Pagbati' },
      photos: { en: 'Your Photos', tl: 'Inyong mga Larawan' },
      rsvp: { en: 'RSVP', tl: 'RSVP' },
      contact: { en: 'Questions?', tl: 'May Tanong?' },
    },
    lines: {
      cover: { en: 'Together with their families', tl: 'Kasama ang kanilang mga pamilya' },
      story: { en: 'Every love story is beautiful, but ours is our favorite.', tl: 'Maganda ang bawat kuwento ng pag-ibig, pero ang amin ang paborito namin.' },
      parents: { en: 'Who first taught us what love looks like.', tl: 'Na unang nagturo sa amin kung ano ang pag-ibig.' },
      invitation: { en: 'Come celebrate with us', tl: 'Halina at makipagdiwang' },
      entourage: { en: 'The people we love most', tl: 'Ang mga taong pinakamamahal namin' },
      sponsors: { en: 'With love and guidance', tl: 'Nang may pagmamahal at gabay' },
      gallery: { en: 'A few of our favorite frames', tl: 'Ilan sa aming mga paboritong kuha' },
      galleryNote: { en: 'Every picture, the same answer: you.', tl: 'Sa bawat larawan, iisa ang sagot: ikaw.' },
      galleryVideo: { en: 'Watch us fall', tl: 'Panoorin kaming umibig' },
      galleryClose: { en: 'And this is only the beginning.', tl: 'At simula pa lamang ito.' },
      venue: { en: "Where we'll say yes", tl: 'Kung saan kami magsasabi ng oo' },
      interlude2: { en: 'Love grows\nhere.', tl: 'Dito lumalago\nang pag-ibig.' },
      dressCode: { en: 'Dress for a celebration', tl: 'Magbihis para sa pagdiriwang' },
      dressNote: { en: 'Our colours, if you would like to join in.', tl: 'Ang aming mga kulay, kung nais ninyong makisabay.' },
      giftThanks: { en: 'With all our thanks', tl: 'Taos-pusong pasasalamat' },
      program: { en: 'How the day unfolds', tl: 'Kung paano tatakbo ang araw' },
      social: { en: 'Share your snaps of us', tl: 'I-share ang mga kuha mo sa amin' },
      socialCta: { en: 'Post with our hashtag', tl: 'I-post gamit ang aming hashtag' },
      guestbook: { en: 'Write us a little note', tl: 'Sulatan kami ng maikling mensahe' },
      photos: { en: 'Send us what you captured', tl: 'Ipadala sa amin ang inyong mga kuha' },
      photosIntro: { en: 'Photos from the day, straight from you.', tl: 'Mga larawan mula sa araw na iyon, galing mismo sa inyo.' },
      countdown: { en: 'Counting the days', tl: 'Binibilang ang mga araw' },
      contact: { en: 'Ask us anything', tl: 'Magtanong lang' },
      contactNote: { en: "We're happy to help with anything at all.", tl: 'Masaya kaming tumulong sa kahit ano.' },
      closing: { en: 'With all our love', tl: 'Nang buong pagmamahal' },
      closingMessage: { en: 'Your presence means the world to us. Thank you for celebrating our love.', tl: 'Napakahalaga sa amin ng inyong presensya. Salamat sa pakikipagdiwang sa aming pag-ibig.' },
      verse: { en: 'Love is patient, love is kind. It always protects, always trusts, always hopes, always perseveres.', tl: 'Ang pag-ibig ay matiyaga at magandang-loob. Lagi itong nagtatanggol, nagtitiwala, umaasa at nagtitiis.' },
      verseRef: { en: '1 Corinthians 13:4, 7', tl: '1 Corinto 13:4, 7' },
      moment1: { en: 'Two hearts', tl: 'Dalawang puso' },
      moment2: { en: 'One', tl: 'Iisa' },
      moment3: { en: 'Forever', tl: 'Magpakailanman' },
      gentsNote: { en: '', tl: '' },
      ladiesNote: { en: '', tl: '' },
    },
  },
  {
    key: 'modern',
    name: 'Modern',
    tagline: 'Light geometric capitals, wide tracking, and short lines in an italic serif.',
    fonts: {
      names: "'Montserrat', 'Segoe UI', system-ui, sans-serif",
      display: "'Montserrat', 'Segoe UI', system-ui, sans-serif",
      body: "'Jost', 'Segoe UI', system-ui, sans-serif",
      script: CORMORANT,
      scriptStyle: 'italic',
      load: ['Montserrat:wght@300;400;500;600', 'Jost:wght@400;500', 'Cormorant Garamond:ital,wght@0,400;1,400;1,500'],
    },
    joiner: '&',
    titles: {
      story: { en: 'Where It Began', tl: 'Kung Saan Nagsimula' },
      parents: { en: 'Parents', tl: 'Mga Magulang' },
      invitation: { en: 'The Details', tl: 'Ang Detalye' },
      entourage: { en: 'Our People', tl: 'Ang Aming mga Tao' },
      gallery: { en: 'Us', tl: 'Kami' },
      venue: { en: 'The Place', tl: 'Ang Lugar' },
      getting: { en: 'Directions', tl: 'Direksyon' },
      dressCode: { en: 'Dress Code', tl: 'Dress Code' },
      gift: { en: 'Gifts', tl: 'Regalo' },
      program: { en: 'The Plan', tl: 'Ang Plano' },
      social: { en: 'Tag Us', tl: 'I-tag Kami' },
      guestbook: { en: 'Leave a Note', tl: 'Mag-iwan ng Mensahe' },
      photos: { en: 'Your Shots', tl: 'Inyong mga Kuha' },
      rsvp: { en: 'RSVP', tl: 'RSVP' },
      contact: { en: 'Need a Hand?', tl: 'Kailangan ng Tulong?' },
    },
    lines: {
      cover: { en: 'The wedding of', tl: 'Ang kasal nina' },
      story: { en: '', tl: '' },
      parents: { en: 'With their blessing.', tl: 'Nang may basbas.' },
      invitation: { en: "You're invited", tl: 'Inaanyayahan ka' },
      entourage: { en: 'Standing with us', tl: 'Kasama namin' },
      sponsors: { en: 'With love and guidance', tl: 'Nang may pagmamahal at gabay' },
      gallery: { en: 'Before the big day', tl: 'Bago ang malaking araw' },
      galleryNote: { en: 'Moments, kept.', tl: 'Mga sandali, iningatan.' },
      galleryVideo: { en: 'In motion', tl: 'Gumagalaw' },
      galleryClose: { en: 'More to come.', tl: 'Marami pang darating.' },
      venue: { en: 'Where it happens', tl: 'Kung saan mangyayari' },
      interlude2: { en: 'Good food, good people,\ngood times.', tl: 'Masarap na pagkain, mabubuting tao,\nmasayang sandali.' },
      dressCode: { en: 'Come as you are, dressed up', tl: 'Halika nang nakabihis nang maayos' },
      dressNote: { en: 'Our palette, for anyone who wants to match.', tl: 'Ang aming palette, para sa gustong makisabay.' },
      giftThanks: { en: 'Thank you', tl: 'Salamat' },
      program: { en: 'What happens when', tl: 'Ano ang mangyayari, kailan' },
      social: { en: 'Post it, tag it', tl: 'I-post, i-tag' },
      socialCta: { en: 'Use', tl: 'Gamitin ang' },
      guestbook: { en: 'A few words for us', tl: 'Ilang salita para sa amin' },
      photos: { en: 'Send us your photos', tl: 'Ipadala ang inyong mga larawan' },
      photosIntro: { en: 'From your phone to our album.', tl: 'Mula sa inyong phone patungo sa aming album.' },
      countdown: { en: 'Not long now', tl: 'Malapit na' },
      contact: { en: "We've got you", tl: 'Nandito kami' },
      contactNote: { en: 'Message us any time.', tl: 'Mag-message kahit kailan.' },
      closing: { en: 'See you soon', tl: 'Magkita tayo' },
      closingMessage: { en: 'Thank you for being here with us.', tl: 'Salamat sa pagsama sa amin.' },
      verse: { en: 'I have found the one whom my soul loves.', tl: 'Natagpuan ko ang minamahal ng aking kaluluwa.' },
      verseRef: { en: 'Song of Solomon 3:4', tl: 'Awit ni Solomon 3:4' },
      moment1: { en: 'Here', tl: 'Dito' },
      moment2: { en: 'Now', tl: 'Ngayon' },
      moment3: { en: 'Always', tl: 'Palagi' },
      gentsNote: { en: '', tl: '' },
      ladiesNote: { en: '', tl: '' },
    },
  },
  {
    key: 'editorial',
    name: 'Editorial',
    tagline: 'A high-contrast Didone for the names, an old-style body, and a fine French script.',
    fonts: {
      names: "'Bodoni Moda', 'Didot', 'Bodoni 72', Georgia, serif",
      display: "'Bodoni Moda', 'Didot', 'Bodoni 72', Georgia, serif",
      body: "'EB Garamond', Garamond, Georgia, serif",
      script: "'Parisienne', 'Snell Roundhand', cursive",
      load: ['Bodoni Moda:ital,wght@0,400;0,500;0,600;1,400', 'EB Garamond:ital,wght@0,400;0,500;1,400', 'Parisienne'],
    },
    joiner: 'and',
    titles: {
      story: { en: 'A Story in Chapters', tl: 'Kuwento sa mga Kabanata' },
      parents: { en: 'Our Parents', tl: 'Ang Aming Mga Magulang' },
      invitation: { en: 'The Invitation', tl: 'Ang Paanyaya' },
      entourage: { en: 'In Good Company', tl: 'Sa Mabuting Piling' },
      gallery: { en: 'A Portrait of Us', tl: 'Larawan Namin' },
      venue: { en: 'The Setting', tl: 'Ang Tagpuan' },
      getting: { en: 'The Way There', tl: 'Ang Daan Papunta' },
      dressCode: { en: 'The Dress Code', tl: 'Ang Dress Code' },
      gift: { en: 'On Gifts', tl: 'Tungkol sa Regalo' },
      program: { en: 'The Order of the Day', tl: 'Ang Takbo ng Araw' },
      social: { en: 'For the Record', tl: 'Para sa Alaala' },
      guestbook: { en: 'Your Words', tl: 'Inyong mga Salita' },
      photos: { en: 'From Your Lens', tl: 'Mula sa Inyong Lente' },
      rsvp: { en: 'Kindly Reply', tl: 'Pakisagot' },
      contact: { en: 'At Your Service', tl: 'Narito Kami' },
    },
    lines: {
      cover: { en: 'The honour of your presence is requested at the marriage of', tl: 'Hinihiling ang karangalan ng inyong presensya sa kasal nina' },
      story: { en: 'Every chapter, ours.', tl: 'Bawat kabanata, amin.' },
      parents: { en: 'The first chapter was theirs.', tl: 'Ang unang kabanata ay kanila.' },
      invitation: { en: 'Requesting the pleasure of your company', tl: 'Hinihiling ang inyong pagdalo' },
      entourage: { en: 'Those who stand beside us', tl: 'Ang mga nasa tabi namin' },
      sponsors: { en: 'With love and guidance', tl: 'Nang may pagmamahal at gabay' },
      gallery: { en: 'Us, as we are', tl: 'Kami, kung ano kami' },
      galleryNote: { en: 'A few frames from the way here.', tl: 'Ilang kuha mula sa daan patungo rito.' },
      galleryVideo: { en: 'The film', tl: 'Ang pelikula' },
      galleryClose: { en: 'To be continued.', tl: 'Itutuloy.' },
      venue: { en: 'A room we chose for you', tl: 'Isang lugar na pinili namin para sa inyo' },
      interlude2: { en: 'Everything,\nand then some.', tl: 'Lahat,\nat higit pa.' },
      dressCode: { en: 'Dress with occasion', tl: 'Magbihis nang naaayon' },
      dressNote: { en: 'We would be delighted to see you in our palette.', tl: 'Ikagagalak naming makita kayo sa aming palette.' },
      giftThanks: { en: 'With gratitude', tl: 'Nang may pasasalamat' },
      program: { en: 'The shape of the day', tl: 'Ang hugis ng araw' },
      social: { en: 'Keep it with us', tl: 'Itago kasama namin' },
      socialCta: { en: 'Share under', tl: 'I-share sa ilalim ng' },
      guestbook: { en: 'Leave a line for the record', tl: 'Mag-iwan ng linya para sa alaala' },
      photos: { en: 'Send us the day as you saw it', tl: 'Ipadala ang araw ayon sa inyong nakita' },
      photosIntro: { en: 'Your photographs, added to ours.', tl: 'Ang inyong mga larawan, idaragdag sa amin.' },
      countdown: { en: 'Until then', tl: 'Hanggang sa araw na iyon' },
      contact: { en: 'Should you need anything', tl: 'Kung may kailangan kayo' },
      contactNote: { en: 'A question, a request, a change of plans — write to us.', tl: 'Tanong, hiling, pagbabago ng plano — sumulat sa amin.' },
      closing: { en: 'Until we meet', tl: 'Hanggang sa muli' },
      closingMessage: { en: 'With grateful hearts, we thank you for sharing this day with us.', tl: 'Nang may pusong nagpapasalamat, salamat sa pagbabahagi ng araw na ito sa amin.' },
      verse: { en: 'Two are better than one. A cord of three strands is not quickly broken.', tl: 'Mas mabuti ang dalawa kaysa isa. Ang lubid na tatlong pilipit ay hindi agad napapatid.' },
      verseRef: { en: 'Ecclesiastes 4:9, 12', tl: 'Mangangaral 4:9, 12' },
      moment1: { en: 'The beginning', tl: 'Ang simula' },
      moment2: { en: 'Of every', tl: 'Ng bawat' },
      moment3: { en: 'Tomorrow', tl: 'Bukas' },
      gentsNote: { en: '', tl: '' },
      ladiesNote: { en: '', tl: '' },
    },
  },
  {
    key: 'regal',
    name: 'Regal',
    tagline: 'Inscriptional capitals for the names, Cormorant for the rest, and a full script.',
    fonts: {
      names: "'Cinzel', 'Trajan Pro', 'Cormorant Garamond', serif",
      display: CORMORANT,
      body: CORMORANT,
      script: "'Great Vibes', 'Brush Script MT', cursive",
      load: ['Cinzel:wght@400;500;600', CORMORANT_LOAD, 'Great Vibes'],
    },
    joiner: '&',
    titles: {
      story: { en: 'Our Story', tl: 'Ang Aming Kuwento' },
      parents: { en: 'Our Parents', tl: 'Ang Aming Mga Magulang' },
      invitation: { en: 'The Wedding', tl: 'Ang Kasal' },
      entourage: { en: 'The Entourage', tl: 'Ang Entourage' },
      gallery: { en: 'Prenup', tl: 'Prenup' },
      venue: { en: 'The Reception', tl: 'Ang Salu-salo' },
      getting: { en: 'Getting There', tl: 'Papunta Roon' },
      dressCode: { en: 'Attire', tl: 'Kasuotan' },
      gift: { en: 'Gift Guide', tl: 'Tungkol sa Regalo' },
      program: { en: 'Programme', tl: 'Programa' },
      social: { en: 'Share the Joy', tl: 'I-share ang Saya' },
      guestbook: { en: 'Well Wishes', tl: 'Mga Pagbati' },
      photos: { en: 'Photos from Our Guests', tl: 'Mga Larawan Mula sa Bisita' },
      rsvp: { en: 'RSVP', tl: 'RSVP' },
      contact: { en: 'Questions?', tl: 'May Tanong?' },
    },
    lines: {
      cover: { en: 'Together with their families', tl: 'Kasama ang kanilang mga pamilya' },
      story: { en: 'A love written in the stars', tl: 'Pag-ibig na nakasulat sa mga bituin' },
      parents: { en: 'With the blessing of our families', tl: 'Nang may basbas ng aming mga pamilya' },
      invitation: { en: 'Join us as we say I do!', tl: 'Samahan kami sa aming pag-iisang dibdib' },
      entourage: { en: 'With great love', tl: 'Nang may pagmamahal' },
      sponsors: { en: 'With love and guidance', tl: 'Nang may pagmamahal at gabay' },
      gallery: { en: 'Moments to keep', tl: 'Mga sandaling iingatan' },
      galleryNote: { en: 'The days that led us here.', tl: 'Ang mga araw na naghatid sa amin dito.' },
      galleryVideo: { en: 'Our story, in motion', tl: 'Ang aming kuwento, gumagalaw' },
      galleryClose: { en: 'The best is yet to come.', tl: 'Ang pinakamaganda ay paparating pa lamang.' },
      venue: { en: 'The celebration continues', tl: 'Nagpapatuloy ang pagdiriwang' },
      interlude2: { en: 'To love,\nlaughter and\nhappily ever after.', tl: 'Sa pag-ibig,\nsa tawanan at\nsa masayang habambuhay.' },
      dressCode: { en: 'Dress the part', tl: 'Sa kasuotang nararapat' },
      dressNote: { en: 'We would love to see you in our chosen colours.', tl: 'Ikagagalak naming makita kayo sa aming napiling mga kulay.' },
      giftThanks: { en: 'Thank you!', tl: 'Maraming salamat!' },
      program: { en: 'A day to remember', tl: 'Isang araw na hindi malilimutan' },
      social: { en: 'Help us capture the love!', tl: 'Tulungan kaming makuha ang saya!' },
      socialCta: { en: 'Use our hashtag', tl: 'Gamitin ang aming hashtag' },
      guestbook: { en: 'Leave us a message', tl: 'Mag-iwan ng mensahe' },
      photos: { en: 'Share your snaps with us!', tl: 'I-share ang mga kuha mo!' },
      photosIntro: { en: 'Upload your photos from our special day.', tl: 'I-upload ang inyong mga larawan mula sa aming espesyal na araw.' },
      countdown: { en: 'Counting down to the big day', tl: 'Bilang ng araw bago ang okasyon' },
      contact: { en: "We're here to help!", tl: 'Narito kami para tumulong!' },
      contactNote: { en: 'For any questions, feel free to reach out.', tl: 'Para sa anumang tanong, huwag mag-atubiling magtanong.' },
      closing: { en: 'See you there!', tl: 'Kita-kits!' },
      closingMessage: { en: 'We are honoured by your presence and grateful for your love.', tl: 'Karangalan namin ang inyong presensya, at nagpapasalamat kami sa inyong pagmamahal.' },
      verse: { en: 'Many waters cannot quench love, neither can floods drown it.', tl: 'Hindi kayang patayin ng maraming tubig ang pag-ibig, ni malunod man ito ng mga baha.' },
      verseRef: { en: 'Song of Solomon 8:7', tl: 'Awit ni Solomon 8:7' },
      moment1: { en: 'Together', tl: 'Magkasama' },
      moment2: { en: 'From this day', tl: 'Mula sa araw na ito' },
      moment3: { en: 'Forward', tl: 'Pasulong' },
      gentsNote: { en: '', tl: '' },
      ladiesNote: { en: '', tl: '' },
    },
  },
];

export const LOOK_BY_KEY: Record<LookKey, Look> = Object.fromEntries(LOOKS.map((l) => [l.key, l])) as Record<LookKey, Look>;

export function isLook(value: string): value is LookKey {
  return (LOOK_KEYS as readonly string[]).includes(value);
}

/**
 * How many looks a package may choose from. The faces are part of what is
 * bought: Basic is set in the design's own look and picks nothing, Standard
 * chooses among three, Signature among all five. A design's own look is what
 * every package starts in, whichever list it belongs to — so a Basic
 * invitation is never left without a voice, it simply keeps the one the
 * design was drawn in.
 */
export const LOOK_MIN_TIER: Record<LookKey, Tier> = {
  modern: 'BASIC',
  romance: 'STANDARD',
  editorial: 'STANDARD',
  heritage: 'COMPLETE',
  regal: 'COMPLETE',
};

/**
 * The look every package has, and the one a design falls back to when its own
 * is above the package: a design drawn in Regal, bought at Basic, is set in
 * Modern rather than in nothing.
 */
export const BASE_LOOK: LookKey = 'modern';

/**
 * The looks this package may pick, the ones it already had first. Basic has
 * one — the font style it is set in, with nothing to choose.
 */
export function looksFor(tier: Tier): (Look & { key: LookKey })[] {
  return LOOKS.filter((l) => tierAtLeast(tier, LOOK_MIN_TIER[l.key])).sort(
    (a, b) => RANK[LOOK_MIN_TIER[a.key]] - RANK[LOOK_MIN_TIER[b.key]] || LOOKS.indexOf(a) - LOOKS.indexOf(b),
  );
}

/** Whether this package may set that look. Blank — the design's own — is always allowed. */
export function lookAllowed(tier: Tier, key: string): boolean {
  if (!key) return true;
  return isLook(key) && tierAtLeast(tier, LOOK_MIN_TIER[key]);
}

/** The look a page is actually set in: the one asked for, if the package has it; else the one every package has. */
export function lookForTier(tier: Tier, key: string): LookKey {
  return isLook(key) && lookAllowed(tier, key) ? key : BASE_LOOK;
}

/** How many looks the package chooses from, for the copy that says so. */
export function lookCount(tier: Tier): number {
  return looksFor(tier).length;
}

/** The line a look writes at `key`, or nothing when it writes none there. */
/*
 * A look's words are written for a wedding, and some of them cannot be lent
 * to another occasion.
 *
 * Every look holds one set of lines, and they were written for the thing
 * this business sells most of: two people marrying. On a christening that
 * came out as "Join us as we say I do!" under the Church & Mass heading and
 * "Some love stories deserve to be seen" under a baby's photographs — and,
 * worst of all, as the eyebrow over the child's name, because a look's
 * `cover` line replaces the one the app words per occasion. The modern
 * look's is literally "The wedding of".
 *
 * So each of those lines names the occasions it may speak for. Asked about
 * any other, it says nothing at all, and the heading stands alone or the
 * app's own occasion-aware wording takes over — `heroCopy` has said "The
 * Christening of" correctly all along. Silence is right rather than timid
 * here: a line that says the wrong thing is worse than no line.
 *
 * `LINES_FOR` and `TITLES_FOR` are where an occasion's own words go, and
 * they are asked first, so an occasion that has been written for keeps its
 * sentences whichever look is set.
 */
const A_MARRIAGE: Occasion[] = ['WEDDING', 'ANNIVERSARY'];
const A_COUPLE: Occasion[] = ['WEDDING', 'ANNIVERSARY', 'ENGAGEMENT'];

const ONLY_FOR: Partial<Record<LineKey, Occasion[]>> = {
  cover: A_MARRIAGE,
  invitation: A_MARRIAGE,
  story: A_COUPLE,
  entourage: A_COUPLE,
  galleryNote: A_COUPLE,
  galleryVideo: A_COUPLE,
  galleryClose: A_COUPLE,
};

const TITLES_ONLY_FOR: Partial<Record<TitleKey, Occasion[]>> = {
  gallery: A_COUPLE,
  entourage: A_COUPLE,
};

/**
 * An occasion's own words, ahead of every look's.
 *
 * A christening is what is written here because it is what is being sold
 * beside the wedding. The others fall silent on the lines above until their
 * words are written, which is a thing to do rather than a thing to invent:
 * these are sentences that go on a stranger's invitation, and they should
 * be in the owner's voice, not in mine.
 *
 * `cover` is deliberately absent: withheld, it falls through to the app's
 * own "The Christening of", which is already right for all fourteen.
 */
const LINES_FOR: Partial<Record<Occasion, Partial<Record<LineKey, Line>>>> = {
  CHRISTENING: {
    story: { en: 'A little prayer, a big answer.', tl: 'Isang munting dasal, isang malaking sagot.' },
    invitation: {
      en: 'Join us as we welcome our little one into God\u2019s family.',
      tl: 'Samahan kami sa pagtanggap sa aming munting anghel sa pamilya ng Diyos.',
    },
    galleryNote: {
      en: 'The little moments we never want to forget.',
      tl: 'Ang mga munting sandaling hindi namin malilimutan.',
    },
    galleryVideo: { en: 'Our little one, in motion', tl: 'Ang aming munting anghel, gumagalaw' },
    galleryClose: {
      en: 'Small hands, and a whole world ahead of them.',
      tl: 'Maliliit na kamay, at isang buong mundong naghihintay.',
    },
    verse: {
      en: 'Let the little children come to me, and do not hinder them, for the kingdom of heaven belongs to such as these.',
      tl: 'Hayaan ninyong lumapit sa akin ang maliliit na bata, at huwag ninyo silang pagbawalan, sapagkat ang kaharian ng langit ay nauukol sa mga katulad nila.',
    },
    verseRef: { en: 'Matthew 19:14', tl: 'Mateo 19:14' },
  },
};

const TITLES_FOR: Partial<Record<Occasion, Partial<Record<TitleKey, Line>>>> = {
  CHRISTENING: {
    gallery: { en: 'Baby Photos', tl: 'Mga Larawan ng Sanggol' },
  },
};

/**
 * A line of a look, in this occasion's voice.
 *
 * The occasion is optional so that a caller which genuinely has none — a
 * showcase of the looks themselves — reads them as written. Every caller
 * that is rendering somebody's invitation has one and must pass it.
 */
export function lookLine(look: Look | undefined, lang: Lang, key: LineKey, occasion?: Occasion): string | undefined {
  // What this design wrote for itself, in this language, wins over everything.
  if (look?.own?.lines?.[lang]?.includes(key)) return look.lines[key]?.[lang] || undefined;
  const own = occasion ? LINES_FOR[occasion]?.[key] : undefined;
  if (own) return own[lang] || own.en || undefined;
  const only = ONLY_FOR[key];
  if (occasion && only && !only.includes(occasion)) return undefined;
  const line = look?.lines[key];
  const text = line ? line[lang] || line.en : '';
  return text || undefined;
}

/** The heading a look gives a section, when it names one, in this occasion's voice. */
export function lookTitle(look: Look | undefined, lang: Lang, key: TitleKey, occasion?: Occasion): string | undefined {
  if (look?.own?.titles?.[lang]?.includes(key)) return look.titles[key]?.[lang] || undefined;
  const own = occasion ? TITLES_FOR[occasion]?.[key] : undefined;
  if (own) return own[lang] || own.en || undefined;
  const only = TITLES_ONLY_FOR[key];
  if (occasion && only && !only.includes(occasion)) return undefined;
  const title = look?.titles[key];
  return title ? title[lang] || title.en : undefined;
}
