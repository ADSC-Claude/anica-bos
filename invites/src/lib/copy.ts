/**
 * Fixed phrases on the guest page, in English and Tagalog, and the default
 * copy blocks the builder offers. `t()` never throws: an unknown key renders
 * as the key so a typo is visible rather than blank.
 *
 * Tagalog here is the everyday register — the way an invitation card printed
 * in Manila reads — not textbook Filipino. "Paki-confirm" rather than
 * "Mangyaring kumpirmahin", because that is what the tita will actually say.
 */

export type Lang = 'en' | 'tl';

export const LANGS: { key: Lang; label: string }[] = [
  { key: 'en', label: 'English' },
  { key: 'tl', label: 'Tagalog / Taglish' },
];

const PHRASES = {
  'nav.rsvp': { en: 'RSVP', tl: 'RSVP' },
  'cover.intro': { en: 'Together with their families', tl: 'Kasama ang kanilang mga pamilya' },
  'cover.invite': { en: 'joyfully invite you to celebrate their wedding', tl: 'ay masayang nag-aanyaya sa inyo sa kanilang kasal' },
  'cover.saveTheDate': { en: 'Save the Date', tl: 'I-save ang Petsa' },
  'countdown.title': { en: 'Counting down to the big day', tl: 'Bilang ng araw bago ang okasyon' },
  'countdown.days': { en: 'Days', tl: 'Araw' },
  'countdown.hours': { en: 'Hours', tl: 'Oras' },
  'countdown.minutes': { en: 'Minutes', tl: 'Minuto' },
  'countdown.seconds': { en: 'Seconds', tl: 'Segundo' },
  'countdown.today': { en: 'It is today!', tl: 'Ngayon na!' },
  'parents.title': { en: 'Our Parents', tl: 'Mga Magulang' },
  'parents.together': { en: 'Together with their parents', tl: 'Kasama ang kanilang mga magulang' },
  'parents.blessing': { en: 'With the blessing of their parents', tl: 'Sa basbas ng kanilang mga magulang' },
  'parents.bride': { en: 'Parents of the Bride', tl: 'Mga Magulang ng Babae' },
  'parents.groom': { en: 'Parents of the Groom', tl: 'Mga Magulang ng Lalaki' },
  'parents.hosts': { en: 'Hosted by', tl: 'Mula sa' },
  'parents.late': { en: 'the late', tl: 'yumaong' },
  'ceremony.title': { en: 'Ceremony', tl: 'Seremonya' },
  'ceremony.seatedBy': { en: 'Guests are requested to be seated by', tl: 'Hinihiling na nakaupo na ang mga bisita bago mag-' },
  'reception.title': { en: 'Reception', tl: 'Salu-salo' },
  'venue.title': { en: 'Venue', tl: 'Lugar' },
  'map.google': { en: 'Google Maps', tl: 'Google Maps' },
  'map.waze': { en: 'Waze', tl: 'Waze' },
  'calendar.add': { en: 'Add to calendar', tl: 'Idagdag sa calendar' },
  'entourage.title': { en: 'The Entourage', tl: 'Ang Entourage' },
  'entourage.principal': { en: 'Principal Sponsors', tl: 'Mga Ninong at Ninang' },
  'entourage.ninong': { en: 'Ninong', tl: 'Ninong' },
  'entourage.ninang': { en: 'Ninang', tl: 'Ninang' },
  'entourage.secondary': { en: 'Secondary Sponsors', tl: 'Secondary Sponsors' },
  'entourage.candle': { en: 'Candle', tl: 'Kandila' },
  'entourage.veil': { en: 'Veil', tl: 'Belo' },
  'entourage.cord': { en: 'Cord', tl: 'Yugal' },
  'entourage.bestMan': { en: 'Best Man', tl: 'Best Man' },
  'entourage.maidOfHonor': { en: 'Maid of Honor', tl: 'Maid of Honor' },
  'entourage.matronOfHonor': { en: 'Matron of Honor', tl: 'Matron of Honor' },
  'entourage.groomsmen': { en: 'Groomsmen', tl: 'Groomsmen' },
  'entourage.bridesmaids': { en: 'Bridesmaids', tl: 'Bridesmaids' },
  'entourage.juniorGroomsmen': { en: 'Junior Groomsmen', tl: 'Junior Groomsmen' },
  'entourage.juniorBridesmaids': { en: 'Junior Bridesmaids', tl: 'Junior Bridesmaids' },
  'entourage.littleGroom': { en: 'Little Groom', tl: 'Little Groom' },
  'entourage.littleBride': { en: 'Little Bride', tl: 'Little Bride' },
  'entourage.ringBearer': { en: 'Ring Bearer', tl: 'Tagadala ng Singsing' },
  'entourage.coinBearer': { en: 'Coin Bearer', tl: 'Tagadala ng Arras' },
  'entourage.bibleBearer': { en: 'Bible Bearer', tl: 'Tagadala ng Bibliya' },
  'entourage.flowerGirls': { en: 'Flower Girls', tl: 'Flower Girls' },
  'entourage.officiant': { en: 'Officiating Priest', tl: 'Pari' },
  'sponsors.title': { en: 'Godparents', tl: 'Mga Ninong at Ninang' },
  'sponsors.ninongs': { en: 'Ninongs', tl: 'Mga Ninong' },
  'sponsors.ninangs': { en: 'Ninangs', tl: 'Mga Ninang' },
  'eighteen.title': { en: 'The Eighteens', tl: 'Ang Labing-walo' },
  'eighteen.roses': { en: '18 Roses', tl: '18 Roses' },
  'eighteen.candles': { en: '18 Candles', tl: '18 Candles' },
  'eighteen.treasures': { en: '18 Treasures', tl: '18 Treasures' },
  'eighteen.blueBills': { en: '18 Blue Bills', tl: '18 Blue Bills' },
  'eighteen.balloons': { en: '18 Balloons', tl: '18 Balloons' },
  'eighteen.shots': { en: '18 Shots', tl: '18 Shots' },
  'eighteen.cotillion': { en: 'Cotillion de Honor', tl: 'Cotillion de Honor' },
  'dressCode.title': { en: 'Dress Code', tl: 'Kasuotan' },
  'dressCode.motif': { en: 'Colour motif', tl: 'Kulay ng motif' },
  'dressCode.sponsors': { en: 'Principal sponsors', tl: 'Mga ninong at ninang' },
  'dressCode.entourage': { en: 'Entourage', tl: 'Entourage' },
  'dressCode.avoidWhite': { en: 'Please avoid white and off-white.', tl: 'Iwasan po ang puti at off-white.' },
  'gift.title': { en: 'Gift Note', tl: 'Tungkol sa Regalo' },
  'gift.gcash': { en: 'Send a gift via GCash', tl: 'Magpadala ng regalo sa GCash' },
  'gift.bank': { en: 'Bank details', tl: 'Bank details' },
  'gift.registry': { en: 'Registry', tl: 'Registry' },
  'rsvp.title': { en: 'RSVP', tl: 'RSVP' },
  'rsvp.lead': { en: 'Kindly confirm your attendance', tl: 'Paki-confirm po ang inyong pagdalo' },
  'rsvp.deadline': { en: 'on or before', tl: 'bago ang' },
  'rsvp.reserved': { en: 'We have reserved {n} seat(s) in your honor.', tl: 'May nakalaan pong {n} upuan para sa inyo.' },
  'rsvp.dear': { en: 'Dear', tl: 'Mahal naming' },
  'rsvp.name': { en: 'Your name', tl: 'Pangalan' },
  'rsvp.accept': { en: 'Joyfully accepts', tl: 'Dadalo' },
  'rsvp.decline': { en: 'Regretfully declines', tl: 'Hindi makakadalo' },
  'rsvp.seats': { en: 'How many of you are coming?', tl: 'Ilan kayong darating?' },
  'rsvp.attendees': { en: 'Names of those attending', tl: 'Pangalan ng mga dadalo' },
  'rsvp.meal': { en: 'Meal choice', tl: 'Pagpipiliang pagkain' },
  'rsvp.dietary': { en: 'Allergies or dietary notes', tl: 'Allergy o iba pang paalala sa pagkain' },
  'rsvp.message': { en: 'A message for {hosts}', tl: 'Mensahe para sa {hosts}' },
  'rsvp.phone': { en: 'Mobile number (optional)', tl: 'Mobile number (optional)' },
  'rsvp.submit': { en: 'Send my response', tl: 'Ipadala' },
  'rsvp.update': { en: 'Update my response', tl: 'I-update ang sagot' },
  'rsvp.thanks': { en: 'Thank you! Your response has been recorded.', tl: 'Maraming salamat! Natanggap na namin ang inyong sagot.' },
  'rsvp.closed': { en: 'RSVP has closed. Please message the hosts directly.', tl: 'Sarado na po ang RSVP. Paki-message na lang po ang mga host.' },
  'rsvp.seeYou': { en: 'We look forward to celebrating with you!', tl: 'Kita-kits po!' },
  'rsvp.sorry': { en: 'We will miss you. Thank you for letting us know.', tl: 'Mami-miss ka namin. Salamat sa pagpapaalam.' },
  'story.title': { en: 'Our Story', tl: 'Ang Aming Kuwento' },
  'story.howWeMet': { en: 'How we met', tl: 'Paano kami nagkakilala' },
  'story.proposal': { en: 'The proposal', tl: 'Ang pag-propose' },
  'gallery.title': { en: 'Gallery', tl: 'Mga Larawan' },
  'gallery.video': { en: 'Watch our video', tl: 'Panoorin ang video' },
  'program.title': { en: 'Program', tl: 'Programa' },
  'program.agenda': { en: 'Agenda', tl: 'Agenda' },
  'faq.title': { en: 'Good to know', tl: 'Mga Paalala' },
  'travel.title': { en: 'Accommodation & Travel', tl: 'Tuluyan at Biyahe' },
  'travel.hotels': { en: 'Where to stay', tl: 'Saan pwedeng tumuloy' },
  'travel.directions': { en: 'Getting there', tl: 'Paano pumunta' },
  'social.title': { en: 'Share the joy', tl: 'I-share ang saya' },
  'social.hashtag': { en: 'Use our hashtag', tl: 'Gamitin ang aming hashtag' },
  'social.unplugged': { en: 'Unplugged ceremony', tl: 'Unplugged ceremony' },
  'music.play': { en: 'Play music', tl: 'Patugtugin' },
  'music.pause': { en: 'Pause music', tl: 'I-pause' },
  'guestbook.title': { en: 'Well Wishes', tl: 'Mga Pagbati' },
  'guestbook.prompt': { en: 'Leave a message for {hosts}', tl: 'Mag-iwan ng mensahe para sa {hosts}' },
  'guestbook.submit': { en: 'Post my wish', tl: 'I-post' },
  'guestbook.pending': { en: 'Thank you! Your message will appear once the hosts approve it.', tl: 'Salamat! Lalabas ang mensahe mo pagka-approve ng mga host.' },
  'seating.title': { en: 'Your table', tl: 'Ang inyong mesa' },
  'closing.title': { en: 'See you there', tl: 'Kita-kits' },
  'envelope.open': { en: 'Tap to open', tl: 'I-tap para buksan' },
  'share.download': { en: 'Download as image', tl: 'I-download bilang larawan' },
  'share.print': { en: 'Print / Save as PDF', tl: 'I-print / I-save bilang PDF' },
  'speakers.title': { en: 'Speakers', tl: 'Mga Tagapagsalita' },
  'family.title': { en: 'The Family', tl: 'Ang Pamilya' },
  'memorial.mass': { en: 'Thanksgiving Mass', tl: 'Misa ng Pasasalamat' },
  'memorial.inLieu': { en: 'In lieu of flowers', tl: 'Sa halip na bulaklak' },
  'contact.title': { en: 'Questions?', tl: 'May tanong?' },
  'contact.registration': { en: 'Registration', tl: 'Registration' },
  'checkin.title': { en: 'Check-in code', tl: 'Check-in code' },
  'checkin.hint': { en: 'Show this at the entrance.', tl: 'Ipakita ito sa entrance.' },
} as const;

export type PhraseKey = keyof typeof PHRASES;

export function t(lang: Lang, key: PhraseKey, vars: Record<string, string | number> = {}): string {
  const entry = PHRASES[key] as { en: string; tl: string } | undefined;
  let text = entry ? entry[lang] ?? entry.en : key;
  for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
  return text;
}

/** The default copy blocks the builder offers. Every one is editable. */
export type Preset = { key: string; label: string; en: string; tl: string };

export const INTRO_PRESETS: Preset[] = [
  {
    key: 'families',
    label: 'Together with their families',
    en: 'Together with their families, {a} and {b} joyfully invite you to celebrate their wedding.',
    tl: 'Kasama ang kanilang mga pamilya, masayang inaanyayahan kayo nina {a} at {b} sa kanilang kasal.',
  },
  {
    key: 'parents',
    label: 'With the blessing of their parents',
    en: 'With the blessing of their parents, {a} and {b} request the honor of your presence at their wedding.',
    tl: 'Sa basbas ng kanilang mga magulang, hinihiling nina {a} at {b} ang inyong presensya sa kanilang kasal.',
  },
  {
    key: 'simple',
    label: 'Simple',
    en: '{a} and {b} invite you to celebrate with them.',
    tl: 'Inaanyayahan kayo nina {a} at {b} na makipagdiwang sa kanila.',
  },
];

export const GIFT_PRESETS: Preset[] = [
  {
    key: 'presence',
    label: 'Your presence is the present',
    en: 'Your presence is the greatest gift. Should you wish to give more, a monetary gift would be warmly appreciated.',
    tl: 'Ang inyong presensya ang pinakamahalagang regalo. Kung nais ninyong magbigay pa, malugod naming tatanggapin ang regalong pera.',
  },
  {
    key: 'monetary',
    label: 'Monetary gift preferred',
    en: 'As we begin our life together, a monetary gift toward our new home would be gratefully received.',
    tl: 'Habang sinisimulan namin ang aming buhay na magkasama, lubos naming ikagagalak ang regalong pera para sa aming bagong tahanan.',
  },
  {
    key: 'noBoxed',
    label: 'No boxed gifts',
    en: 'With all that we have, we have been truly blessed. Your presence is all we ask — no boxed gifts, please.',
    tl: 'Sapat na sa amin ang lahat ng mayroon kami. Ang inyong presensya lang ang aming hiling — walang boxed gifts po.',
  },
];

export const RSVP_NOTE_PRESETS: Preset[] = [
  {
    key: 'reserved',
    label: 'Reserved seats',
    en: 'We have reserved {n} seat(s) in your honor. Kindly confirm your attendance on or before {date}.',
    tl: 'May nakalaan pong {n} upuan para sa inyo. Paki-confirm po ang inyong pagdalo bago ang {date}.',
  },
];

export const POLICY_PRESETS: Preset[] = [
  {
    key: 'adultsOnly',
    label: 'Adults only',
    en: 'As much as we love your little ones, this celebration is for adults only.',
    tl: 'Bagama\'t mahal namin ang inyong mga anak, ang okasyong ito ay para sa mga adult lamang.',
  },
  {
    key: 'noPlusOnes',
    label: 'No plus-ones',
    en: 'We have reserved seats for the guests named on this invitation. We are unable to accommodate additional guests.',
    tl: 'Nakalaan ang mga upuan para sa mga pangalang nasa imbitasyong ito. Hindi po kami makakatanggap ng karagdagang bisita.',
  },
  {
    key: 'byInvitation',
    label: 'Strictly by invitation',
    en: 'This celebration is strictly by invitation. Kindly present this invitation at the entrance.',
    tl: 'Ang okasyong ito ay para lamang sa mga imbitado. Pakipakita po ang imbitasyong ito sa entrance.',
  },
];

export const UNPLUGGED_PRESET: Preset = {
  key: 'unplugged',
  label: 'Unplugged ceremony',
  en: 'We kindly ask that phones and cameras stay tucked away during the ceremony. Our photographers will capture every moment.',
  tl: 'Pakitago po muna ang mga cellphone at camera habang nagaganap ang seremonya. Kukunan po ng aming photographer ang bawat sandali.',
};

export function preset(list: Preset[], key: string, lang: Lang): string {
  const found = list.find((p) => p.key === key) ?? list[0];
  return lang === 'tl' ? found.tl : found.en;
}

/** Title options for parents, sponsors and the like. */
export const TITLES = ['', 'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Engr.', 'Atty.', 'Arch.', 'Col. (Ret.)', 'Capt.', 'Gen. (Ret.)', 'Hon.', 'Rev.', 'Fr.', 'Sr.', 'Prof.', 'Judge', 'Mayor', 'Cong.', 'Gov.'];
