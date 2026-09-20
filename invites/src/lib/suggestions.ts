import type { Occasion } from '@prisma/client';
import type { Preset, RowStarter } from './copy';

/**
 * Ready-made wording for every writing box a customer fills, in the
 * occasion's own words. A blank box is the hardest thing to fill in, so
 * each offers two or three examples; one tap puts the words in the box and
 * the customer edits them or writes over them. Every one has a Tagalog
 * reading, chosen by the invitation's language.
 *
 * The boxes are grouped by what the occasion is — a couple's day, a child's,
 * a party, a company's, a life remembered — because "we" means a different
 * we on each, and a wedding's note about the church is nonsense on a
 * corporate programme. The message boxes that already carry their own
 * examples in copy.ts keep them; this file fills in the rest. A staff-only
 * box carries none, for the reason copy.ts gives: the encoder is filling
 * twenty of them at a time, and a blank one is backed by the look's line.
 */
type Family = 'couple' | 'child' | 'party' | 'corporate' | 'memorial';

export function familyOf(occasion: Occasion): Family {
  switch (occasion) {
    case 'WEDDING':
    case 'ANNIVERSARY':
    case 'ENGAGEMENT':
      return 'couple';
    case 'CHRISTENING':
    case 'COMMUNION':
    case 'KIDS_BIRTHDAY':
    case 'BABY_SHOWER':
      return 'child';
    case 'CORPORATE':
      return 'corporate';
    case 'MEMORIAL':
      return 'memorial';
    default:
      return 'party';
  }
}

const p = (key: string, label: string, en: string, tl: string): Preset => ({ key, label, en, tl });

/** The same words for every occasion: a car park is a car park. */
const EVERY: Record<string, Preset[]> = {
  parkingNote: [
    p('free', 'Free parking at the venue', 'Free parking at the venue; overflow parking across the road.', 'Libreng paradahan sa venue; may karagdagang paradahan sa tapat.'),
    p('carpool', 'Limited parking', 'Parking is limited — carpooling is a big help.', 'Limitado ang paradahan — malaking tulong ang pagsasabay-sabay sa sasakyan.'),
    p('dropoff', 'Drop-off at the entrance', 'Drop-off is at the main entrance; the car park is behind the building.', 'Sa harap ng pasukan ang baba; nasa likod ng gusali ang paradahan.'),
  ],
  parentNote: [
    p('love', 'With all their love', 'with all their love', 'nang buong pagmamahal'),
    p('memory', 'In loving memory', 'in loving memory', 'sa mapagmahal na alaala'),
    p('raised', 'Who raised us with so much love', 'who raised us with so much love', 'na nagpalaki sa amin nang may lubos na pagmamahal'),
  ],
  sponsorsAttire: [
    p('filipiniana', 'Barong and Filipiniana', 'Barong Tagalog and Filipiniana in our colours', 'Barong Tagalog at Filipiniana sa aming mga kulay'),
    p('formal', 'Suit and long gown', 'Black suit and long gown', 'Itim na suit at mahabang gown'),
    p('cream', 'Cream barong, pastel gown', 'Cream barong and pastel long gown', 'Cream na barong at pastel na mahabang gown'),
  ],
  entourageAttire: [
    p('sage', 'Sage and grey', 'Sage green gowns; grey suits', 'Sage green na gown; grey na suit'),
    p('blush', 'Blush and cream', 'Filipiniana in blush; barong in cream', 'Filipiniana sa blush; barong sa cream'),
    p('blue', 'Dusty blue, floor length', 'Dusty blue, floor length', 'Dusty blue, hanggang sahig'),
  ],
  bankDetails: [
    p('format', 'Bank · Name · Account', 'BPI · Juan Dela Cruz · 1234-5678-90', 'BPI · Juan Dela Cruz · 1234-5678-90'),
  ],
  extrasNote: [
    p('nickname', 'The nickname we use at home', 'The nickname we use at home is —', 'Ang palayaw namin sa bahay ay —'),
    p('spelling', 'Spell the names as written', 'Please spell the names exactly as written here.', 'Pakisulat ang mga pangalan nang eksakto tulad ng nakasulat dito.'),
    p('colours', 'Which colour matters most', 'Our colours are in the photos — the dusty blue matters most.', 'Nasa mga larawan ang aming mga kulay — ang dusty blue ang pinakamahalaga.'),
  ],
};

const BY_FAMILY: Record<Family, Record<string, Preset[]>> = {
  couple: {
    openingLine: [
      p('invited', 'You are invited', 'You are invited', 'Kayo ay inaanyayahan'),
      p('families', 'Together with our families', 'Together with our families', 'Kasama ang aming mga pamilya'),
      p('date', 'Save the date', 'Save the date — and see you there', 'Tandaan ang petsa — at magkita tayo roon'),
    ],
    venueNote: [
      p('early', 'Arrive a little early', 'Please arrive fifteen minutes before the ceremony so we can begin on time.', 'Pakidating labinlimang minuto bago ang seremonya upang makapagsimula tayo sa oras.'),
      p('parking', 'Where to park', 'Parking is at the church grounds; the gate on the left opens at 1 PM.', 'Sa bakuran ng simbahan ang paradahan; bukas ang gate sa kaliwa mula 1 PM.'),
      p('after', 'The reception follows', 'The reception follows right after — see you at the venue.', 'Kasunod agad ang reception — magkita tayo sa venue.'),
    ],
    dressNote: [
      p('palette', 'Our colours, if you like', 'We would love to see you in our colours — anything in the palette, or a touch of it.', 'Ikagagalak naming makita kayo sa aming mga kulay — kahit ano sa palette, o kahit kaunti nito.'),
      p('formal', 'Formal attire', 'Formal attire, please: barong or suit for the gentlemen, long gown for the ladies.', 'Pormal na kasuotan po: barong o suit para sa mga ginoo, mahabang gown para sa mga binibini.'),
      p('garden', 'Garden setting', 'The reception is in a garden — flats and wedges are your friends.', 'Nasa hardin ang reception — mas mainam ang flats at wedges.'),
    ],
    momentText: [
      p('began', 'Where it all began', 'Where it all began — a dinner neither of us wanted to go to.', 'Kung saan nagsimula ang lahat — isang hapunang ayaw naming pareho puntahan.'),
      p('trip', 'The trip', 'The trip that turned "you" into "us".', 'Ang biyaheng gumawa sa "ikaw" na "tayo".'),
      p('yes', 'The yes', 'He asked, she said yes, and we have not stopped smiling since.', 'Nagtanong siya, sumagot siya ng oo, at hindi na kami tumigil sa pagngiti.'),
    ],
    activities: [
      p('games', 'Games and a dance-off', 'Games after dinner, and a dance-off to close the night.', 'Mga laro pagkatapos ng hapunan, at dance-off para tapusin ang gabi.'),
      p('booth', 'Photo booth all night', 'A photo booth all night — take a strip home.', 'Photo booth buong gabi — mag-uwi ng strip.'),
    ],
    signature: [
      p('love', 'With all our love', 'With all our love', 'Nang buong pagmamahal'),
      p('family', 'Our whole family', 'With love from our whole family', 'Mula sa buong pamilya, nang may pagmamahal'),
      p('grateful', 'Forever grateful', 'Forever grateful', 'Lubos na nagpapasalamat'),
    ],
  },
  child: {
    openingLine: [
      p('star', 'A little one is celebrated', 'A little one is being celebrated', 'Isang munting bituin ang ipagdiriwang'),
      p('invited', 'You are invited', 'You are invited', 'Kayo ay inaanyayahan'),
      p('come', 'Come and celebrate', 'Come and celebrate with us', 'Halina at makipagdiwang sa amin'),
    ],
    venueNote: [
      p('seated', 'Be seated early', 'The mass starts on time; please be seated ten minutes before.', 'Sisimulan ang misa sa oras; pakiupo sampung minuto bago nito.'),
      p('kids', 'Kids are welcome', 'Kids are welcome — there is a play corner at the reception.', 'Welcome ang mga bata — may play corner sa reception.'),
      p('lunch', 'Lunch follows', 'Lunch follows right after the ceremony, at the venue below.', 'Kasunod agad ang tanghalian pagkatapos ng seremonya, sa venue sa ibaba.'),
    ],
    /*
     * No chip offering the attire back to the family.
     *
     * "In the dress code still remove the 'smart casual, in the colours
     * above etc' no need for that"
     *
     * 'Smart casual, in the colours above if you like.' was here, and it is
     * the one sentence the drawn dress code page already says twice over: it
     * is headed with the attire, it draws the clothes, and it names every
     * swatch under the palette. A family who takes the chip ends up with a
     * caption repeating the page. The two left say something the page cannot
     * draw — the weather, and where everyone is coming from.
     */
    dressNote: [
      p('outdoors', 'Dress light, it is outdoors', 'The party is outdoors — dress light and bring a hat for the little ones.', 'Sa labas ang party — magbihis nang magaan at magdala ng sumbrero para sa mga bata.'),
      p('sunday', 'Sunday best', 'Sunday best, please — we are coming from the church.', 'Pang-Linggong bihis po — galing tayo sa simbahan.'),
    ],
    momentText: [
      p('found', 'The day we found out', 'The day we found out — and cried happy tears.', 'Ang araw na nalaman namin — at umiyak sa tuwa.'),
      p('face', 'Your little face', 'Our first look at your little face.', 'Ang una naming sulyap sa iyong munting mukha.'),
      p('home', 'Home at last', 'Home at last, with the whole family waiting.', 'Sa wakas ay nasa bahay, kasama ang buong pamilyang naghihintay.'),
    ],
    activities: [
      p('parlour', 'Parlour games and a piñata', 'Parlour games, a magic show, and a piñata to finish.', 'Mga parlor game, isang magic show, at piñata sa huli.'),
      p('face', 'Face painting from 2 PM', 'Face painting and balloon animals from 2 PM.', 'Face painting at balloon animals mula 2 PM.'),
      p('disco', 'A mini disco at 4', 'Bring your dancing shoes — a mini disco for the kids at 4.', 'Dalhin ang inyong sayawan — mini disco para sa mga bata sa alas-4.'),
    ],
    signature: [
      p('parents', 'Mom, Dad and the family', 'Mom, Dad and the whole family', 'Nanay, Tatay at ang buong pamilya'),
      p('proud', 'The proud parents', 'The proud parents', 'Ang mga nagmamalaking magulang'),
      p('love', 'With love, the family', 'With love, the family', 'Nang may pagmamahal, ang pamilya'),
    ],
  },
  party: {
    openingLine: [
      p('invited', 'You are invited', 'You are invited', 'Kayo ay inaanyayahan'),
      p('celebrate', 'Come celebrate with us', 'Come celebrate with us', 'Halina at makipagdiwang sa amin'),
      p('night', 'A night to remember', 'A night to remember', 'Isang gabing hindi malilimutan'),
    ],
    venueNote: [
      p('doors', 'Doors open at 6', 'Doors open at 6 PM; the programme starts at 7.', 'Bukas ang pinto mula 6 PM; magsisimula ang programa sa alas-7.'),
      p('parking', 'Parking and drop-off', 'Parking is at the venue; ride-share drop-off is at the main gate.', 'Sa venue ang paradahan; sa main gate ang baba ng ride-share.'),
      p('dinner', 'Dinner at 7:30', 'Dinner is served at 7:30 — come hungry.', 'Ihahain ang hapunan sa 7:30 — dumating nang gutom.'),
    ],
    dressNote: [
      p('cocktail', 'Cocktail attire', 'Dress to impress — cocktail attire.', 'Magbihis nang mapapahanga — cocktail attire.'),
      p('comfortable', 'Come comfortable', 'Come comfortable; the night ends on the dance floor.', 'Dumating nang komportable; sa dance floor nagtatapos ang gabi.'),
      p('blacktie', 'Black tie optional', 'Black tie optional — our colours above if you want to match.', 'Black tie optional — ang aming mga kulay sa itaas kung nais ninyong makisabay.'),
    ],
    momentText: [
      p('year', 'The year everything changed', 'The year everything changed.', 'Ang taong nagbago ang lahat.'),
      p('friends', 'Friends who became family', 'Friends who became family.', 'Mga kaibigang naging pamilya.'),
      p('dream', 'The dream that started it', 'The dream that started it all.', 'Ang pangarap na nagsimula ng lahat.'),
    ],
    activities: [
      p('games', 'Games and a video wall', 'Games, a video message wall, and a dance-off.', 'Mga laro, isang video message wall, at dance-off.'),
      p('roses', 'The 18 roses at 8', 'A photo booth all night, and the 18 roses at 8.', 'Photo booth buong gabi, at ang 18 roses sa alas-8.'),
      p('mic', 'Open mic after dinner', 'Open mic for messages after dinner.', 'Open mic para sa mga mensahe pagkatapos ng hapunan.'),
    ],
    signature: [
      p('family', 'With love, the family', 'With love, the family', 'Nang may pagmamahal, ang pamilya'),
      p('celebrant', 'The celebrant', 'The celebrant', 'Ang may kaarawan'),
      p('grateful', 'Forever grateful', 'Forever grateful', 'Lubos na nagpapasalamat'),
    ],
  },
  corporate: {
    openingLine: [
      p('invited', 'You are invited', 'You are invited', 'Kayo ay inaanyayahan'),
      p('join', 'Join us', 'Join us', 'Samahan ninyo kami'),
      p('forward', 'We look forward to seeing you', 'We look forward to seeing you', 'Inaasahan namin ang inyong pagdalo'),
    ],
    venueNote: [
      p('registration', 'Registration opens early', 'Registration opens 30 minutes before the programme.', 'Bukas ang registration 30 minuto bago ang programa.'),
      p('qr', 'Bring your QR code', 'Please bring this invitation or your QR code for check-in.', 'Pakidala ang imbitasyong ito o ang inyong QR code para sa check-in.'),
      p('parking', 'Parking at Basement 2', 'Parking is at Basement 2; have your ticket validated at the registration desk.', 'Sa Basement 2 ang paradahan; pa-validate ang ticket sa registration desk.'),
    ],
    dressNote: [
      p('business', 'Business attire', 'Business attire.', 'Business attire.'),
      p('smart', 'Smart casual, ID please', 'Smart casual; please bring your company ID.', 'Smart casual; pakidala ang inyong company ID.'),
      p('formal', 'Business formal', 'Business formal — the evening is photographed.', 'Business formal — may kukuha ng litrato sa gabing ito.'),
    ],
    momentText: [
      p('founded', 'Where we started', 'Where we started, and who was there.', 'Kung saan kami nagsimula, at kung sino ang naroon.'),
      p('milestone', 'A milestone', 'The milestone that changed the company.', 'Ang milestone na nagbago sa kumpanya.'),
    ],
    activities: [
      p('awards', 'Awards and a raffle', 'Awards, a raffle, and dinner to follow.', 'Mga parangal, raffle, at hapunan pagkatapos.'),
      p('networking', 'Networking after', 'Networking over drinks after the programme.', 'Networking habang nag-iinuman pagkatapos ng programa.'),
    ],
    signature: [
      p('team', 'The organising team', 'The organising team', 'Ang organising team'),
      p('management', 'Management and staff', 'Management and staff', 'Ang pamunuan at mga kawani'),
    ],
  },
  memorial: {
    openingLine: [
      p('memory', 'In loving memory', 'In loving memory', 'Sa mapagmahal na alaala'),
      p('life', 'A celebration of life', 'A celebration of life', 'Isang pagdiriwang ng buhay'),
      p('remember', 'Join us in remembrance', 'Join us in remembrance', 'Samahan ninyo kami sa pag-alaala'),
    ],
    venueNote: [
      p('early', 'Arrive a little early', 'Please arrive a little early so we can begin together.', 'Pakidating nang mas maaga upang sabay-sabay tayong magsimula.'),
      p('meal', 'A simple meal follows', 'A simple meal follows the service.', 'May simpleng salu-salo pagkatapos ng serbisyo.'),
      p('flowers', 'In lieu of flowers', 'In lieu of flowers, a donation to the family is welcome.', 'Sa halip na bulaklak, malugod na tinatanggap ang tulong sa pamilya.'),
    ],
    dressNote: [
      p('white', 'White, or their favourite colour', "Please wear white, or our loved one's favourite colour.", 'Magsuot po ng puti, o ng paboritong kulay ng aming mahal.'),
      p('simple', 'Simple and comfortable', 'Simple and comfortable; the family thanks you for coming.', 'Simple at komportable; nagpapasalamat ang pamilya sa inyong pagdalo.'),
      p('any', 'Any colour is welcome', 'Any colour is welcome — this is a celebration of a life.', 'Malugod ang anumang kulay — pagdiriwang ito ng isang buhay.'),
    ],
    momentText: [
      p('gave', 'What they gave us', 'What they gave us, and what we carry on.', 'Ang ibinigay nila sa amin, at ang ipagpapatuloy namin.'),
      p('laugh', 'The laugh we remember', 'The laugh we will always remember.', 'Ang tawang lagi naming maaalala.'),
    ],
    activities: [
      p('tributes', 'Tributes after the service', 'Tributes from family and friends after the service.', 'Mga pagpupugay mula sa pamilya at mga kaibigan pagkatapos ng serbisyo.'),
    ],
    signature: [
      p('family', 'The family', 'The family', 'Ang pamilya'),
      p('gratitude', 'With gratitude, the family', 'With gratitude, the family', 'Nang may pasasalamat, ang pamilya'),
    ],
  },
};

/**
 * Where each box's examples come from. A key is `section.field`, or
 * `section.list.field` for a box inside a list; the value names the set
 * above. Boxes not here — names, numbers, links, and the message boxes that
 * already carry their own examples — get none.
 */
const BOXES: Record<string, { every?: keyof typeof EVERY; family?: string }> = {
  'cover.openingLine': { family: 'openingLine' },
  'ceremony.note': { family: 'venueNote' },
  'reception.note': { family: 'venueNote' },
  'ceremony.parkingNote': { every: 'parkingNote' },
  'reception.parkingNote': { every: 'parkingNote' },
  'parents.brideNote': { every: 'parentNote' },
  'parents.groomNote': { every: 'parentNote' },
  'parents.note': { every: 'parentNote' },
  'parents.rows.note': { every: 'parentNote' },
  'dressCode.note': { family: 'dressNote' },
  'dressCode.sponsorsAttire': { every: 'sponsorsAttire' },
  'dressCode.entourageAttire': { every: 'entourageAttire' },
  'story.timeline.text': { family: 'momentText' },
  'program.activities': { family: 'activities' },
  'gift.bankDetails': { every: 'bankDetails' },
  'closing.signature': { family: 'signature' },
  'extras.note': { every: 'extrasNote' },
};

/** The examples for one box, in this occasion's words — or none. */
export function suggestionsFor(path: string, occasion: Occasion): Preset[] | undefined {
  const box = BOXES[path] ?? BOXES[path.replace(/\.[^.]+\.([^.]+)$/, '.$1')];
  if (!box) return undefined;
  if (box.every) return EVERY[box.every];
  return box.family ? BY_FAMILY[familyOf(occasion)][box.family] : undefined;
}

/**
 * The questions a guest actually asks, with an answer already written.
 *
 * The FAQ was the one list on the form with nothing offered at all — an
 * empty box headed "Questions" and a customer left to invent both halves of
 * six of them. Meanwhile the christening's Good to know page printed four
 * questions of the design's own, which is how a page came to show questions
 * the form had never been given: the words were the artwork's, not theirs.
 *
 * These are theirs. One tap adds the pair as an ordinary row, to edit, to
 * reword or to remove, with their own questions beside it.
 *
 * The answers are written to be edited rather than used as they stand —
 * every one names a thing the family has to fill in (a time, a place, a
 * yes or a no), because an answer nobody has to touch is an answer nobody
 * reads before publishing.
 */
const FAQ: Record<Family, RowStarter[]> = {
  child: [
    { key: 'children', label: 'Are children welcome?', row: {
      q: { en: 'Are children welcome?', tl: 'Puwede bang magsama ng mga bata?' },
      a: { en: 'Yes — the little ones are part of the day. There are games and giveaways for them after lunch.', tl: 'Opo — kasama ang mga bata sa araw na ito. May laro at giveaways para sa kanila pagkatapos ng tanghalian.' } } },
    { key: 'parking', label: 'Is there parking?', row: {
      q: { en: 'Is there parking?', tl: 'May paradahan po ba?' },
      a: { en: 'Yes, free parking at the venue, and street parking around the church.', tl: 'Opo, libreng paradahan sa venue, at may paradahan din sa tabi ng simbahan.' } } },
    { key: 'arrive', label: 'What time should we arrive?', row: {
      q: { en: 'What time should we arrive?', tl: 'Anong oras po kami dapat dumating?' },
      a: { en: 'Please be seated by 9:45 AM. The Mass starts on the dot.', tl: 'Mangyaring maupo na bago mag-9:45 AM. Magsisimula ang Misa nang eksakto.' } } },
    { key: 'photos', label: 'Can we post photos?', row: {
      q: { en: 'Can we post photos?', tl: 'Puwede po bang mag-post ng litrato?' },
      a: { en: 'Please do — use our hashtag so we can find them all.', tl: 'Opo — gamitin lang po ang aming hashtag para makita namin lahat.' } } },
    { key: 'gift', label: 'What should we bring?', row: {
      q: { en: 'What should we bring?', tl: 'Ano po ang dapat naming dalhin?' },
      a: { en: 'Nothing but yourselves. Your presence is the gift we are asking for.', tl: 'Kayo lang po. Ang pagdalo ninyo ang regalong hinihiling namin.' } } },
    { key: 'long', label: 'How long will it be?', row: {
      q: { en: 'How long will it be?', tl: 'Gaano po katagal?' },
      a: { en: 'The Mass runs about an hour, and lunch follows until around 2 PM.', tl: 'Mga isang oras ang Misa, at susunod ang tanghalian hanggang mga 2 PM.' } } },
  ],
  couple: [
    { key: 'children', label: 'Are children welcome?', row: {
      q: { en: 'Are children welcome?', tl: 'Puwede bang magsama ng mga bata?' },
      a: { en: 'We love your little ones, but we have chosen an adults-only celebration.', tl: 'Mahal namin ang inyong mga anak, ngunit adults-only po ang aming pagdiriwang.' } } },
    { key: 'plusone', label: 'Can I bring someone?', row: {
      q: { en: 'Can I bring someone?', tl: 'Puwede po ba akong magsama?' },
      a: { en: 'Your invitation says how many seats are reserved for you. Do let us know either way.', tl: 'Nakasaad sa inyong imbitasyon kung ilang upuan ang nakalaan. Pakisabi lang po sa amin.' } } },
    { key: 'parking', label: 'Is there parking?', row: {
      q: { en: 'Is there parking?', tl: 'May paradahan po ba?' },
      a: { en: 'Yes, free parking at the reception venue and beside the church.', tl: 'Opo, libreng paradahan sa reception venue at sa tabi ng simbahan.' } } },
    { key: 'arrive', label: 'What time should we arrive?', row: {
      q: { en: 'What time should we arrive?', tl: 'Anong oras po kami dapat dumating?' },
      a: { en: 'Please be seated thirty minutes before the ceremony begins.', tl: 'Mangyaring maupo na tatlumpung minuto bago magsimula ang seremonya.' } } },
    { key: 'photos', label: 'Can we post photos?', row: {
      q: { en: 'Can we post photos?', tl: 'Puwede po bang mag-post ng litrato?' },
      a: { en: 'After the ceremony, please — and use our hashtag so we can find them.', tl: 'Pagkatapos po ng seremonya — at gamitin ang aming hashtag para makita namin.' } } },
    { key: 'rain', label: 'What if it rains?', row: {
      q: { en: 'What if it rains?', tl: 'Paano kung umulan?' },
      a: { en: 'The reception moves indoors. Nothing else changes.', tl: 'Ilipat sa loob ang reception. Wala nang ibang magbabago.' } } },
  ],
  party: [
    { key: 'parking', label: 'Is there parking?', row: {
      q: { en: 'Is there parking?', tl: 'May paradahan po ba?' },
      a: { en: 'Yes, free parking at the venue.', tl: 'Opo, libreng paradahan sa venue.' } } },
    { key: 'arrive', label: 'What time should we arrive?', row: {
      q: { en: 'What time should we arrive?', tl: 'Anong oras po kami dapat dumating?' },
      a: { en: 'Any time from the hour on the invitation — the programme starts thirty minutes later.', tl: 'Kahit anong oras mula sa nakasaad sa imbitasyon — magsisimula ang programa makalipas ang tatlumpung minuto.' } } },
    { key: 'children', label: 'Are children welcome?', row: {
      q: { en: 'Are children welcome?', tl: 'Puwede bang magsama ng mga bata?' },
      a: { en: 'Yes, bring them along.', tl: 'Opo, isama ninyo po sila.' } } },
    { key: 'gift', label: 'What should we bring?', row: {
      q: { en: 'What should we bring?', tl: 'Ano po ang dapat naming dalhin?' },
      a: { en: 'Nothing but yourselves.', tl: 'Kayo lang po.' } } },
    { key: 'photos', label: 'Can we post photos?', row: {
      q: { en: 'Can we post photos?', tl: 'Puwede po bang mag-post ng litrato?' },
      a: { en: 'Please do — use our hashtag so we can find them all.', tl: 'Opo — gamitin lang po ang aming hashtag para makita namin lahat.' } } },
  ],
  corporate: [
    { key: 'register', label: 'Do I need to register?', row: {
      q: { en: 'Do I need to register?', tl: 'Kailangan po bang magparehistro?' },
      a: { en: 'Yes — confirm through the link on this invitation so we can print your badge.', tl: 'Opo — kumpirmahin sa link sa imbitasyong ito para maihanda ang inyong badge.' } } },
    { key: 'parking', label: 'Is there parking?', row: {
      q: { en: 'Is there parking?', tl: 'May paradahan po ba?' },
      a: { en: 'Yes, validated parking at the venue. Bring your ticket to the registration desk.', tl: 'Opo, validated parking sa venue. Dalhin ang inyong ticket sa registration desk.' } } },
    { key: 'dress', label: 'What is the dress code?', row: {
      q: { en: 'What is the dress code?', tl: 'Ano po ang dress code?' },
      a: { en: 'Business attire.', tl: 'Business attire po.' } } },
    { key: 'meals', label: 'Are meals provided?', row: {
      q: { en: 'Are meals provided?', tl: 'May pagkain po ba?' },
      a: { en: 'Yes, lunch and two coffee breaks. Tell us about any dietary needs when you register.', tl: 'Opo, tanghalian at dalawang coffee break. Sabihin lang po ang anumang dietary needs kapag nagparehistro.' } } },
  ],
  memorial: [
    { key: 'flowers', label: 'May we send flowers?', row: {
      q: { en: 'May we send flowers?', tl: 'Puwede po bang magpadala ng bulaklak?' },
      a: { en: 'Flowers may be sent to the chapel. The family is also grateful for Mass offerings.', tl: 'Maaaring ipadala ang bulaklak sa kapilya. Nagpapasalamat din ang pamilya sa mga Misa.' } } },
    { key: 'parking', label: 'Is there parking?', row: {
      q: { en: 'Is there parking?', tl: 'May paradahan po ba?' },
      a: { en: 'Yes, parking at the chapel and along the street beside it.', tl: 'Opo, may paradahan sa kapilya at sa kalye sa tabi nito.' } } },
    { key: 'times', label: 'When may we visit?', row: {
      q: { en: 'When may we visit?', tl: 'Kailan po kami puwedeng dumalaw?' },
      a: { en: 'The chapel is open from morning until late evening each day.', tl: 'Bukas ang kapilya mula umaga hanggang gabi araw-araw.' } } },
    { key: 'dress', label: 'What should we wear?', row: {
      q: { en: 'What should we wear?', tl: 'Ano po ang dapat naming isuot?' },
      a: { en: 'Anything simple and respectful. There is no required colour.', tl: 'Kahit simple at magalang lang po. Walang itinakdang kulay.' } } },
  ],
};

/** The ready-made questions for this occasion, for the FAQ list to offer. */
export function faqStarters(occasion: Occasion): RowStarter[] {
  return FAQ[familyOf(occasion)];
}
