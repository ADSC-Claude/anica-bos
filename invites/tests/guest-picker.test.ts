/**
 * Picking a name off the couple's list instead of typing one.
 *
 * "when the guest type their names (also in the companion), they can simply
 * click their name that shows because this can allow the guest and the
 * celebrant to see the name listed instead of sometimes guest put their
 * nicknames that doesnt show up in the list that didnt match the guestlist"
 *
 * Three things are worth holding still here, and none of them is the drop-down
 * itself: how narrow the match is, that an attendee can carry a row id, and
 * that the switch it all hangs off starts in the off position.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesName, answeredFor, rankGuests, claimedGuestIds, MIN_QUERY, MAX_MATCHES, type ReplyRow } from '../src/lib/guest-match';
import { attendeesOf, type Attendee } from '../src/lib/attendees';
import { fieldsFor } from '../src/lib/sections';

test('a match is the start of a word, never the middle of one', () => {
  const name = 'Ana Dela Cruz';
  // what a guest types about themselves
  for (const q of ['ana', 'Ana', 'dela', 'DELA', 'cruz', 'Cru']) {
    assert.ok(matchesName(name, q), `"${q}" should find ${name}`);
  }
  // and what a sweep would type
  for (const q of ['ela', 'ruz', 'na ', 'zzz']) {
    assert.ok(!matchesName(name, q), `"${q}" should find nobody`);
  }
});

test('two letters find nobody: three is the floor', () => {
  assert.equal(MIN_QUERY, 3);
  assert.ok(!matchesName('Ana Dela Cruz', 'an'), 'two letters is not a search, it is a sweep');
  assert.ok(matchesName('Ana Dela Cruz', 'ana'));
  // and the answer is a handful, not a list
  assert.ok(MAX_MATCHES <= 10, 'a page of names is the guest list, which is the thing not being handed over');
});

test('a name is split on the punctuation a Filipino guest list actually has', () => {
  assert.ok(matchesName('Ma. Cristina Reyes-Santos', 'cristina'));
  assert.ok(matchesName('Ma. Cristina Reyes-Santos', 'santos'), 'a double-barrelled surname is two words');
  assert.ok(matchesName('Mr. & Mrs. Dela Cruz', 'dela'));
  assert.ok(matchesName('Jose (Jojo) Rizal', 'jojo'), 'the nickname in brackets is findable too');
});

/**
 * The id on a companion is what makes the whole thing worth building.
 *
 * "sometimes family includes their spouses as companion even it is listed not
 * as companion but guest itself, it saves the guests and celebrant in manually
 * sending each invitation to guest when they can insert their family"
 */
test('a companion can be a row on the guest list, and a typed one is not', () => {
  const stored = [
    { name: 'Ana Dela Cruz', relation: '' },
    { name: 'Bert Dela Cruz', relation: 'spouse', guestId: 'g_bert' },
    { name: 'Yaya Let', relation: 'helper' },
  ];
  const read = attendeesOf(stored);
  assert.equal(read[1]!.guestId, 'g_bert', 'the wife picked off the list keeps her row');
  assert.equal(read[2]!.guestId, undefined, 'a name typed by hand claims no row');
  assert.equal(read[0]!.guestId, undefined);
});

test('a guest id that is not a string is not a guest id', () => {
  const read = attendeesOf([
    { name: 'A', relation: '', guestId: 42 },
    { name: 'B', relation: '', guestId: '' },
    { name: 'C', relation: '', guestId: { id: 'x' } },
    'D',
  ]);
  for (const a of read) assert.equal((a as Attendee).guestId, undefined, `${a.name} carries no id`);
  assert.equal(read.length, 4, 'and every one of them is still a person at the table');
});

/**
 * Off until a family asks for it.
 *
 * A guest list is private and this makes it searchable by anybody holding the
 * link. That is the trade, it is theirs to make, and a default of "on" would
 * be us making it for every invitation already published.
 */
test('the picker is a switch the family throws, not a default we chose', () => {
  const rsvp = fieldsFor('rsvp', 'CHRISTENING');
  const field = rsvp.find((f) => f.key === 'nameFromList');
  assert.ok(field, 'the RSVP step offers it');
  assert.equal(field!.type, 'toggle');
  assert.ok(!field!.staff, 'the family decides, not us');
  // The hint has to say what switching it on lets other people see. This is
  // the sentence that makes it an informed choice rather than a surprise.
  assert.match(String(field!.hint ?? ''), /anyone with your link can search/i,
    'the hint says plainly what it exposes');
});

/**
 * Who has been answered for — the rule behind the tick in the guest's
 * drop-down and behind "with Ana Dela Cruz" on the couple's list.
 *
 * It is also the rule that keeps the seats honest, which is why it is tested
 * rather than trusted: the whole reason a companion gets no reply row of her
 * own is so she is not counted twice.
 */
const reply = (r: Partial<ReplyRow> & { name: string }): ReplyRow =>
  ({ response: 'ACCEPT', guestId: null, attendees: [], ...r });

test('a reply of your own counts, and it says nobody else answered it', () => {
  const m = answeredFor([reply({ name: 'Ana', guestId: 'g_ana' })]);
  assert.equal(m.get('g_ana'), '', 'blank means she spoke for herself');
  assert.equal(m.size, 1);
});

test('a spouse picked off the list is answered for, by name', () => {
  const m = answeredFor([
    reply({
      name: 'Ana Dela Cruz',
      guestId: 'g_ana',
      attendees: [
        { name: 'Ana Dela Cruz', guestId: 'g_ana' },
        { name: 'Bert Dela Cruz', guestId: 'g_bert' },
        { name: 'Yaya Let' },
      ],
    }),
  ]);
  assert.equal(m.get('g_bert'), 'Ana Dela Cruz', 'his row is answered, and it says who by');
  assert.equal(m.get('g_ana'), '', 'she is not her own companion');
  assert.equal(m.size, 2, 'the yaya is on no list, so she is on no row');
});

test('a regret speaks for nobody but the person declining', () => {
  const m = answeredFor([
    reply({ name: 'Ana', guestId: 'g_ana', response: 'DECLINE', attendees: [{ name: 'Bert', guestId: 'g_bert' }] }),
  ]);
  assert.equal(m.get('g_ana'), '', 'a regret is still an answer');
  assert.ok(!m.has('g_bert'), 'a party nobody is bringing is not a party');
});

test('answering for yourself beats being named in someone else’s party', () => {
  const m = answeredFor([
    reply({ name: 'Ana', attendees: [{ name: 'Ana' }, { name: 'Bert Dela Cruz', guestId: 'g_bert' }] }),
    reply({ name: 'Bert Dela Cruz', guestId: 'g_bert' }),
  ]);
  assert.equal(m.get('g_bert'), '', 'he replied himself, whatever his wife wrote');
});

test('the first party to name someone is the one credited', () => {
  const m = answeredFor([
    reply({ name: 'Ana', attendees: [{ name: 'Ana' }, { name: 'Lola Rosa', guestId: 'g_rosa' }] }),
    reply({ name: 'Ben', attendees: [{ name: 'Ben' }, { name: 'Lola Rosa', guestId: 'g_rosa' }] }),
  ]);
  assert.equal(m.get('g_rosa'), 'Ana', 'one grandmother, one seat, the first party that claimed her');
});

/**
 * Joining a reply to the name it belongs to.
 *
 * "there is a rsvp already for pedro, that what im referring to this tab, it
 * doesnt click to the list i have now"
 *
 * Her first acceptance arrived at 2:47 and her guest list at 4:04, so the
 * reply had nothing to attach to and nothing went back for it afterwards.
 * Pedro sat on the guest list as "no reply yet" while his acceptance sat on
 * the other tab attached to nobody.
 *
 * The ranking only *offers*; a person presses. Marking the wrong lola as
 * coming is worse than leaving a reply unmatched, so this is tested for what
 * it puts at the top rather than for what it would decide.
 */
const LIST = [
  { id: 'g1', name: 'Pedro German' },
  { id: 'g2', name: 'Pedro German Jr.' },
  { id: 'g3', name: 'Reina Catherine German' },
  { id: 'g4', name: 'Ma Luz Corporal' },
  { id: 'g5', name: 'Abigail Ureta' },
];

test('the closest name on the list comes first, and the near-miss after it', () => {
  const best = rankGuests('Pedro german jr', LIST);
  assert.equal(best[0]!.name, 'Pedro German Jr.', 'three words in common beats two');
  assert.equal(best[1]!.name, 'Pedro German');
  assert.ok(!best.some((g) => g.name === 'Abigail Ureta'), 'a name with nothing in common is not offered');
});

test('a family name alone still finds the family', () => {
  const best = rankGuests('Reina catherine buena', LIST);
  assert.equal(best[0]!.name, 'Reina Catherine German', 'two given names carry it');
});

test('a nickname nobody shares offers nothing rather than a guess', () => {
  assert.deepEqual(rankGuests('Jhen', LIST), [], 'better an empty shortlist than the wrong lola');
  assert.deepEqual(rankGuests('', LIST), [], 'and a blank name is not a search');
});

test('the shortlist is a shortlist', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `g${i}`, name: `Maria Santos ${i}` }));
  assert.ok(rankGuests('Maria Santos', many).length <= 6, 'a page of names is not a shortlist');
});

/**
 * One name on the list, claimed once.
 *
 * "now do the companion matching"
 *
 * A party of three is three rows on the couple's list and one reply, so every
 * seat in that party can be joined to a row of its own. What must never happen
 * is the same row joined twice: Lola Rosa on her daughter's reply and again on
 * her son's is one person on the list and two places at the table, and the
 * error would only surface at the caterer.
 *
 * The head of a party is recorded once even though the id sits in two columns,
 * because `Rsvp.guestId` and `attendees[0].guestId` are one slot written
 * together — see matchAttendee().
 */
const PARTY = [
  {
    id: 'r1',
    name: 'Pedro German Jr.',
    guestId: 'g2',
    attendees: [
      { name: 'Pedro German Jr.', guestId: 'g2' },
      { name: 'Reina catherine buena', guestId: 'g3' },
      { name: 'Baby Azriel' },
    ],
  },
  { id: 'r2', name: 'Ma Luz Corporal', guestId: null, attendees: [{ name: 'Ma Luz Corporal' }] },
];

test('a name on the list is held by one seat, and the refusal can say whose', () => {
  const held = claimedGuestIds(PARTY);
  assert.deepEqual(held.get('g2'), { replyId: 'r1', index: 0, by: 'Pedro German Jr.' }, 'the head, once');
  assert.deepEqual(held.get('g3'), { replyId: 'r1', index: 1, by: 'Pedro German Jr.' }, 'and his companion, by position');
  assert.equal(held.has('g4'), false, 'a companion nobody matched holds nothing');
  assert.equal(held.size, 2, 'an untagged reply and an untagged child claim no rows');
});

test('the head is one claim, not two, however the reply records it', () => {
  // An older reply carries the id on the row but never got it onto the party.
  const older = [{ id: 'r9', name: 'Ana Dela Cruz', guestId: 'g1', attendees: [{ name: 'Ana Dela Cruz' }] }];
  const held = claimedGuestIds(older);
  assert.deepEqual(held.get('g1'), { replyId: 'r9', index: 0, by: 'Ana Dela Cruz' });
  // So re-matching that same head to that same row is not a clash with itself.
  const claim = held.get('g1')!;
  assert.ok(claim.replyId === 'r9' && claim.index === 0, 'same slot, no refusal');
});

test('two parties cannot both bring the same lola', () => {
  const both = [
    ...PARTY,
    { id: 'r3', name: 'Abigail Ureta', guestId: null, attendees: [{ name: 'Abigail Ureta' }, { name: 'Lola Rosa', guestId: 'g5' }] },
  ];
  const held = claimedGuestIds(both);
  assert.equal(held.get('g5')!.by, 'Abigail Ureta', 'the first press wins and is named');
  // The second press is the one matchAttendee() refuses: same id, other slot.
  const claim = held.get('g5')!;
  assert.ok(!(claim.replyId === 'r1' && claim.index === 2), 'Pedro cannot claim her as well');
});
