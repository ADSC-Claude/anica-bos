import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactPatch, plainAddress } from '../src/lib/contacts';

// The rule for moving a reply's contact details onto the guest row a blast
// reads. It runs twice over — as a reply is saved, and again in the back-fill
// over replies collected before it did — so it is worth pinning down here
// rather than discovering the two behave differently on somebody's guest list.

const BLANK = { phone: '', email: '' };

test('a reply fills in what the list never had', () => {
  assert.deepEqual(
    contactPatch({ phone: '0917 123 4567', email: 'maria@example.com' }, BLANK),
    { phone: '0917 123 4567', email: 'maria@example.com' },
  );
});

test('blank never wins — a skipped question does not erase what the couple typed', () => {
  const guest = { phone: '0917 000 0000', email: 'tita@example.com' };
  assert.deepEqual(contactPatch({ phone: '', email: '' }, guest), {});
  assert.deepEqual(contactPatch({}, guest), {}, 'nothing at all is the same as blank');
});

test('nothing is written when the reply only repeats the list', () => {
  const guest = { phone: '0917 000 0000', email: 'tita@example.com' };
  assert.deepEqual(contactPatch({ phone: '0917 000 0000', email: 'tita@example.com' }, guest), {});
});

// Live, the guest is the authority on their own number and theirs is the more
// recent of the two.
test('a reply overrules what the couple typed', () => {
  const guest = { phone: '0917 000 0000', email: 'old@example.com' };
  assert.deepEqual(
    contactPatch({ phone: '0918 222 3333', email: 'new@example.com' }, guest),
    { phone: '0918 222 3333', email: 'new@example.com' },
  );
});

// In the back-fill that reasoning runs out: months later there is no telling
// whether the couple corrected the row after the reply came in.
test('the back-fill fills gaps and leaves disagreements alone', () => {
  const guest = { phone: '0917 000 0000', email: '' };
  assert.deepEqual(
    contactPatch({ phone: '0918 222 3333', email: 'maria@example.com' }, guest, { fillBlanksOnly: true }),
    { email: 'maria@example.com' },
    'the address was missing, the number was not',
  );
  assert.deepEqual(
    contactPatch({ phone: '0918 222 3333', email: 'maria@example.com' }, { phone: 'x', email: 'y' }, { fillBlanksOnly: true }),
    {},
    'a full row is left as it is',
  );
});

// A corporate reply used to store its department joined onto the address. It
// has its own column now, but a row that predates the split must still not put
// a department on a mailing list.
test('a department never reaches the guest row', () => {
  assert.deepEqual(
    contactPatch({ phone: '', email: 'maria@example.com · Finance' }, BLANK),
    { email: 'maria@example.com' },
  );
  assert.deepEqual(
    contactPatch({ phone: '', email: ' · Finance' }, BLANK),
    {},
    'a department with no address is nothing to write',
  );
});

test('what is not an address is not written down', () => {
  for (const bad of ['maria', 'maria@', 'not an address', 'maria@localhost']) {
    assert.deepEqual(contactPatch({ phone: '', email: bad }, BLANK), {}, bad);
  }
});

test('plainAddress keeps an ordinary address whole', () => {
  assert.equal(plainAddress('juan.dela.cruz+rsvp@example.com'), 'juan.dela.cruz+rsvp@example.com');
  assert.equal(plainAddress('  maria@example.com  '), 'maria@example.com');
  assert.equal(plainAddress(''), '');
  assert.equal(plainAddress(undefined as unknown as string), '', 'a null column is not a crash');
});
