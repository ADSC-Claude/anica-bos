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
  'cover.invited': { en: "You're invited", tl: 'Inaanyayahan ka' },
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
  'entourage.brideParents': { en: 'Parents of the bride', tl: 'Mga magulang ng bride' },
  'entourage.groomParents': { en: 'Parents of the groom', tl: 'Mga magulang ng groom' },
  'entourage.ninong': { en: 'Ninong', tl: 'Ninong' },
  'entourage.ninang': { en: 'Ninang', tl: 'Ninang' },
  'entourage.secondary': { en: 'Secondary Sponsors', tl: 'Secondary Sponsors' },
  'entourage.candle': { en: 'Candle', tl: 'Kandila' },
  'entourage.veil': { en: 'Veil', tl: 'Belo' },
  'entourage.cord': { en: 'Cord', tl: 'Yugal' },
  'entourage.bestMan': { en: 'Best Man', tl: 'Best Man' },
  'entourage.bestMen': { en: 'Best Men', tl: 'Best Men' },
  'entourage.maidOfHonor': { en: 'Maid of Honor', tl: 'Maid of Honor' },
  'entourage.maidsOfHonor': { en: 'Maids of Honor', tl: 'Maids of Honor' },
  'entourage.matronOfHonor': { en: 'Matron of Honor', tl: 'Matron of Honor' },
  'entourage.matronsOfHonor': { en: 'Matrons of Honor', tl: 'Matrons of Honor' },
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
  'dressCode.attireOf': { en: '{attire} Attire', tl: '{attire} Attire' },
  'dressCode.intro': { en: 'We kindly encourage our guests to come in {attire}.', tl: 'Hinihiling po namin sa aming mga bisita na dumalo nang naka-{attire}.' },
  'dressCode.gents': { en: 'For gentlemen', tl: 'Para sa mga ginoo' },
  'dressCode.ladies': { en: 'For ladies', tl: 'Para sa mga binibini' },
  'dressCode.boys': { en: 'For the boys', tl: 'Para sa mga batang lalaki' },
  'dressCode.girls': { en: 'For the girls', tl: 'Para sa mga batang babae' },
  'dressCode.palette': { en: 'Suggested palette', tl: 'Mungkahing kulay' },
  'dressCode.paletteNote': { en: 'You may choose from this palette or similar shades.', tl: 'Maaari pong pumili mula sa mga kulay na ito o katulad na tono.' },
  'dressCode.avoid': { en: 'Kindly avoid', tl: 'Iwasan po' },
  'dressCode.thanks': { en: 'Thank you!', tl: 'Maraming salamat!' },
  'mode.day': { en: 'Switch to day', tl: 'Sa araw' },
  'mode.night': { en: 'Switch to night', tl: 'Sa gabi' },
  'gift.title': { en: 'Gift Note', tl: 'Tungkol sa Regalo' },
  'gift.gcash': { en: 'Send a gift via GCash', tl: 'Magpadala ng regalo sa GCash' },
  'gift.bank': { en: 'Bank details', tl: 'Bank details' },
  'gift.registry': { en: 'Registry', tl: 'Registry' },
  'cover.follows': { en: 'Invitation to follow', tl: 'Susunod po ang paanyaya' },
  'rsvp.title': { en: 'RSVP', tl: 'RSVP' },
  'rsvp.lead': { en: 'Kindly confirm your attendance', tl: 'Paki-confirm po ang inyong pagdalo' },
  'rsvp.deadline': { en: 'on or before', tl: 'bago ang' },
  'rsvp.reserved': { en: 'We have reserved {n} seat(s) in your honor.', tl: 'May nakalaan pong {n} upuan para sa inyo.' },
  'rsvp.dear': { en: 'Dear', tl: 'Mahal naming' },
  'rsvp.name': { en: 'Your name', tl: 'Pangalan' },
  'rsvp.accept': { en: 'Joyfully accepts', tl: 'Dadalo' },
  'rsvp.decline': { en: 'Regretfully declines', tl: 'Hindi makakadalo' },
  'rsvp.seats': { en: 'How many of you are coming?', tl: 'Ilan kayong darating?' },
  'rsvp.companions': { en: 'Who is coming with you?', tl: 'Sino ang kasama mo?' },
  'rsvp.companion': { en: 'Name of companion {n}', tl: 'Pangalan ng kasama {n}' },
  'rsvp.relation': { en: 'Relationship to you', tl: 'Ano sila sa iyo' },
  'rsvp.relationBlank': { en: 'Please choose', tl: 'Pumili po' },
  'rsvp.relationName': { en: 'Their name', tl: 'Pangalan niya' },
  // What the companion is to the guest bringing them, not to the couple.
  'rsvp.rel.spouse': { en: 'Spouse', tl: 'Asawa' },
  'rsvp.rel.fiance': { en: 'Fiancé / Fiancée', tl: 'Nobyo / Nobya' },
  'rsvp.rel.partner': { en: 'Partner', tl: 'Partner' },
  'rsvp.rel.child': { en: 'Child', tl: 'Anak' },
  'rsvp.rel.parent': { en: 'Parent', tl: 'Magulang' },
  'rsvp.rel.grandparent': { en: 'Grandparent', tl: 'Lolo / Lola' },
  'rsvp.rel.sibling': { en: 'Sibling', tl: 'Kapatid' },
  'rsvp.rel.inlaw': { en: 'In-law', tl: 'Biyenan / Bayaw / Hipag' },
  'rsvp.rel.cousin': { en: 'Cousin', tl: 'Pinsan' },
  'rsvp.rel.nephew': { en: 'Nephew / Niece', tl: 'Pamangkin' },
  'rsvp.rel.relative': { en: 'Relative', tl: 'Kamag-anak' },
  'rsvp.rel.friend': { en: 'Friend', tl: 'Kaibigan' },
  'rsvp.rel.neighbour': { en: 'Neighbour', tl: 'Kapitbahay' },
  'rsvp.rel.colleague': { en: 'Colleague', tl: 'Katrabaho' },
  'rsvp.rel.helper': { en: 'Helper / Yaya', tl: 'Kasambahay / Yaya' },
  'rsvp.rel.caregiver': { en: 'Caregiver / Nurse', tl: 'Tagapag-alaga / Nars' },
  'rsvp.rel.driver': { en: 'Driver', tl: 'Driver' },
  'rsvp.rel.other': { en: 'Someone else', tl: 'Iba pa' },
  'rsvp.meal': { en: 'Meal choice', tl: 'Pagpipiliang pagkain' },
  'rsvp.dietary': { en: 'Allergies or dietary notes', tl: 'Allergy o iba pang paalala sa pagkain' },
  'rsvp.group': { en: 'Which group are you from?', tl: 'Saang grupo po kayo?' },
  'rsvp.message': { en: 'A message for {hosts}', tl: 'Mensahe para sa {hosts}' },
  'rsvp.phone': { en: 'Mobile number', tl: 'Mobile number' },
  'rsvp.phoneHint': { en: 'So we can text you about the day.', tl: 'Para ma-text ka namin tungkol sa okasyon.' },
  'rsvp.email': { en: 'Email address', tl: 'Email address' },
  'rsvp.emailHint': { en: 'Where your confirmation and any updates go.', tl: 'Dito papunta ang kumpirmasyon at mga update.' },
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
  /**
   * Weddings only. A prenup is a wedding thing, and this line is on the guest's
   * own invitation — a christening that invited people to watch its prenup
   * video was saying something the family never said. The renderer falls back
   * to gallery.video for every other occasion.
   */
  'gallery.watchPrenup': { en: 'Watch our prenup video', tl: 'Panoorin ang aming prenup video' },
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
  'photos.title': { en: 'Photos from Our Guests', tl: 'Mga Larawan Mula sa Bisita' },
  'photos.prompt': { en: 'Share your photos from the day', tl: 'I-share ang mga litrato mo ngayong araw' },
  'photos.choose': { en: 'Choose your photos', tl: 'Pumili ng mga larawan' },
  'photos.caption': { en: 'Caption (optional)', tl: 'Caption (opsyonal)' },
  'photos.submit': { en: 'Add my photo', tl: 'Idagdag ang larawan ko' },
  'photos.sending': { en: 'Sending…', tl: 'Ipinapadala…' },
  'photos.pending': { en: 'Salamat! Your photo will appear once the hosts approve it.', tl: 'Salamat! Lalabas ang larawan mo pagka-approve ng mga host.' },
  'photos.thanks': { en: 'Salamat! Your photo is on the wall.', tl: 'Salamat! Nasa wall na ang larawan mo.' },
  'photos.another': { en: 'Add another', tl: 'Magdagdag pa' },
  // The plurals: a guest who sent eight photos should not be thanked for one.
  'photos.submitMany': { en: 'Add my photos', tl: 'Idagdag ang mga larawan ko' },
  'photos.pendingMany': { en: 'Salamat! Your photos will appear once the hosts approve them.', tl: 'Salamat! Lalabas ang mga larawan mo pagka-approve ng mga host.' },
  'photos.thanksMany': { en: 'Salamat! Your photos are on the wall.', tl: 'Salamat! Nasa wall na ang mga larawan mo.' },
  'photos.tooMany': { en: 'Twenty at a time, please — the first twenty are ready to send. You can add the rest after.', tl: 'Dalawampu muna — handa nang ipadala ang unang dalawampu. Puwede mong idagdag ang iba pagkatapos.' },
  'photos.sent': { en: 'sent.', tl: 'ang naipadala.' },
  // Under the file chooser, so a guest knows before they pick rather than
  // after they are refused. The numbers in it are pinned to the real ones by a
  // test — copy about a limit that has drifted from the limit is worse than no
  // copy at all.
  'photos.accepts': { en: 'Photos only, not video — JPEG, PNG or WebP, up to {max} each.', tl: 'Mga larawan lang, hindi video — JPEG, PNG o WebP, hanggang {max} bawat isa.' },
  'photos.empty': { en: 'No photos yet — be the first.', tl: 'Wala pang larawan — mauna ka.' },
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
  'contact.chat': { en: 'Or message us on Viber / WhatsApp.', tl: 'O mag-message sa Viber / WhatsApp.' },
  'venue.both': { en: 'Ceremony & Reception', tl: 'Seremonya at Salu-salo' },
  'venue.reception': { en: 'Reception', tl: 'Salu-salo' },
  'venue.getting': { en: 'Getting there', tl: 'Papunta roon' },
  'map.openGoogle': { en: 'Open in Google Maps', tl: 'Buksan sa Google Maps' },
  'map.openWaze': { en: 'Open in Waze', tl: 'Buksan sa Waze' },
  'cover.scroll': { en: 'Scroll', tl: 'I-scroll' },
  'invitation.ceremony': { en: 'Ceremony', tl: 'Seremonya' },
  'photos.upload': { en: 'Upload here', tl: 'Mag-upload dito' },
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

/**
 * Ready-made wording for the writings the customer does themselves — not the
 * fixed lines a design carries, which are ours. A blank page is the hardest
 * thing to fill in, so each of these fields offers three examples: one tap
 * puts the words in the box, and the customer edits them or writes over them.
 * Every one has a Tagalog reading, chosen by the invitation's language.
 *
 * These are only ever attached to fields a customer fills. A staff-only field
 * carries none: the encoder is filling twenty of them at a time and does not
 * need three suggestions on each.
 */
export const PARENTS_MESSAGE_EXAMPLES: Preset[] = [
  {
    key: 'carried',
    label: 'Your love carried this family',
    en: 'Thank you for standing with us as we raise her. Your love has carried this family further than you know.',
    tl: 'Salamat sa paninindigan ninyo sa amin habang pinapalaki namin siya. Ang pagmamahal ninyo ang nagdala sa pamilyang ito nang higit sa inaasahan.',
  },
  {
    key: 'prayed',
    label: 'We prayed, and you prayed with us',
    en: 'We prayed for this day, and you prayed with us. Thank you for every kindness, small and large.',
    tl: 'Idinasal namin ang araw na ito, at kasama namin kayong nanalangin. Salamat sa bawat kabutihan, maliit at malaki.',
  },
  {
    key: 'fuller',
    label: 'Our home is fuller because of you',
    en: 'Our home is fuller because of the people in it. Thank you for being part of ours.',
    tl: 'Mas buo ang tahanan namin dahil sa mga taong naroon. Salamat sa pagiging bahagi ng amin.',
  },
];

export const SPONSORS_BLESSING_EXAMPLES: Preset[] = [
  {
    key: 'keep',
    label: 'May the Lord bless you and keep you',
    en: 'May the Lord bless you and keep you; may His face shine upon you all the days of your life.',
    tl: 'Pagpalain at ingatan ka ng Panginoon; magliwanag ang Kanyang mukha sa iyo sa lahat ng araw ng buhay mo.',
  },
  {
    key: 'promise',
    label: 'We promise to guide you',
    en: 'We promise to guide you, to pray for you, and to be there whenever you need us.',
    tl: 'Nangangako kaming gagabayan ka, ipagdadasal ka, at nariyan kapag kailangan mo kami.',
  },
  {
    key: 'wisdom',
    label: 'May you grow in wisdom and kindness',
    en: 'May you grow in wisdom and in kindness, and may you always know how loved you are.',
    tl: 'Lumago ka nawa sa karunungan at kabutihan, at malaman mo lagi kung gaano ka kamahal.',
  },
];

export const DEDICATION_EXAMPLES: Preset[] = [
  {
    key: 'prayedFor',
    label: 'You were prayed for',
    en: 'To our little one: you were prayed for long before you were here. This day is our thanksgiving.',
    tl: 'Sa aming munting anghel: ipinagdasal ka namin bago ka pa dumating. Ang araw na ito ang aming pasasalamat.',
  },
  {
    key: 'yourName',
    label: 'Every hope has your name',
    en: 'For you, anak — every hope we have ever had now has your name on it.',
    tl: 'Para sa iyo, anak — ang bawat pangarap naming hawak ngayon ay may pangalan mo na.',
  },
  {
    key: 'family',
    label: 'You made us a family',
    en: 'You made us a family. Everything after this is yours to grow into.',
    tl: 'Ikaw ang gumawa sa amin na isang pamilya. Ang lahat pagkatapos nito ay sa iyo na lalakihan.',
  },
];

export const DEBUTANTE_NOTE_EXAMPLES: Preset[] = [
  {
    key: 'stillTheGirl',
    label: 'Eighteen years, and still your girl',
    en: 'Eighteen years, and I am still the girl who needed all of you. Thank you for raising me, for the lessons and for the patience. Tonight I dance with the people who made me.',
    tl: 'Labingwalong taon, at ako pa rin ang batang nangangailangan sa inyong lahat. Salamat sa pagpapalaki sa akin, sa mga aral at sa pagtitiyaga. Ngayong gabi, sumasayaw ako kasama ang mga taong gumawa sa akin.',
  },
  {
    key: 'sacrifice',
    label: 'To my parents, and to my friends',
    en: 'To my parents: thank you for every sacrifice I only understood later. To my friends: thank you for the noise and for the joy. This night is ours.',
    tl: 'Sa mga magulang ko: salamat sa bawat sakripisyong naunawaan ko lang nang huli. Sa mga kaibigan ko: salamat sa ingay at sa saya. Sa ating lahat ang gabing ito.',
  },
  {
    key: 'whatComesNext',
    label: 'Whatever comes next',
    en: 'I am not sure what comes next, only that I want to meet it the way all of you taught me: kindly, and with my whole heart.',
    tl: 'Hindi ko alam ang susunod, alam ko lang na gusto kong salubungin ito sa paraang itinuro ninyo sa akin: may kabutihan, at buong-buo ang puso.',
  },
];

export const HOW_WE_MET_EXAMPLES: Preset[] = [
  {
    key: 'work',
    label: 'At work, by the coffee machine',
    en: 'We met at work, at the coffee machine on the fourteenth floor, and neither of us remembers who spoke first. What we do remember is that the conversation did not stop for three hours.',
    tl: 'Sa trabaho kami nagkakilala, sa coffee machine sa ikalabing-apat na palapag, at wala sa aming dalawa ang nakakaalala kung sino ang nagsimulang magsalita. Ang natatandaan namin, hindi tumigil ang usapan sa loob ng tatlong oras.',
  },
  {
    key: 'birthday',
    label: "A friend's birthday, one duet",
    en: "A friend's birthday, a crowded videoke room, one duet nobody asked for. We have been singing badly together ever since.",
    tl: 'Kaarawan ng kaibigan, siksikan sa videoke, isang duet na walang humiling. Mula noon, sabay na kaming kumakanta nang wala sa tono.',
  },
  {
    key: 'app',
    label: 'Matched on a Tuesday',
    en: 'We matched on an app on a Tuesday and had our first date that Friday. He was late. She waited.',
    tl: 'Nag-match kami sa app noong Martes at nagkita sa unang beses noong Biyernes. Nahuli siya. Naghintay siya.',
  },
];

export const PROPOSAL_EXAMPLES: Preset[] = [
  {
    key: 'kitchen',
    label: 'In the kitchen, on a normal Sunday',
    en: 'He asked in the kitchen, in the middle of a normal Sunday, with the rice still cooking. She said yes before he had finished the sentence.',
    tl: 'Sa kusina siya nagtanong, sa gitna ng ordinaryong Linggo, habang nagsasaing pa. Sinagot niya ng oo bago pa matapos ang tanong.',
  },
  {
    key: 'trip',
    label: 'A quiet trip, a ring in his bag',
    en: 'It was supposed to be a quiet weekend in Batangas. There was a ring in his bag the whole time and he could not sleep.',
    tl: 'Dapat ay tahimik lang na weekend sa Batangas. May singsing sa bag niya sa buong panahon at hindi siya makatulog.',
  },
  {
    key: 'balcony',
    label: 'No fireworks, no crowd',
    en: 'No fireworks, no crowd. Just the two of us on the balcony and a question we both already knew the answer to.',
    tl: 'Walang fireworks, walang maraming tao. Kaming dalawa lang sa balkonahe at isang tanong na alam na namin ang sagot.',
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
