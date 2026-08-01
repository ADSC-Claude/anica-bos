/**
 * Two names for one person.
 *
 * A therapist has the name on her SSS record and the name everyone says. SSS
 * and BIR want "Ramos, Jennifer Delos Santos"; the client on the booking page
 * and the receptionist calling across the floor both want "Ms. Jen". Neither
 * will do for the other's job, so both are stored and the rule is which goes
 * where.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  displayName,
  fileAsName,
  legalName,
  shownName,
  splitFullName,
} from '../src/lib/people';

const jen = {
  firstName: 'Jennifer',
  middleName: 'Delos Santos',
  lastName: 'Ramos',
  nickname: 'Jen',
  title: 'Ms.',
};

// ------------------------------------------------------------- the legal name

test('the legal name is assembled from the parts, in order', () => {
  assert.equal(legalName(jen), 'Jennifer Delos Santos Ramos');
});

test('a missing middle name does not leave a double space', () => {
  // Two spaces in a name on a government form is the kind of thing that gets a
  // submission bounced.
  assert.equal(legalName({ firstName: 'Joy', lastName: 'Mendoza' }), 'Joy Mendoza');
  assert.equal(legalName({ firstName: 'Joy', middleName: '', lastName: 'Mendoza' }), 'Joy Mendoza');
});

test('surname-first, for payslips that sort by it', () => {
  assert.equal(fileAsName(jen), 'Ramos, Jennifer Delos Santos');
  assert.equal(fileAsName({ firstName: 'Joy', lastName: 'Mendoza' }), 'Mendoza, Joy');
});

test('with no surname on file it does not emit a stray comma', () => {
  assert.equal(fileAsName({ firstName: 'Joy' }), 'Joy');
});

// ---------------------------------------------------------- the name in use

test('she is addressed by title and nickname', () => {
  assert.equal(displayName(jen), 'Ms. Jen');
});

test('the nickname beats the first name — that is what it is for', () => {
  // A therapist introduced to clients as Jen must not appear on the booking
  // page as Jennifer.
  assert.equal(displayName({ ...jen, nickname: 'Jen' }), 'Ms. Jen');
  assert.notEqual(displayName(jen), 'Ms. Jennifer');
});

test('no nickname falls back to her first name', () => {
  assert.equal(displayName({ title: 'Ms.', firstName: 'Maricel' }), 'Ms. Maricel');
});

test('the title is a field, so a male therapist is not called Ms.', () => {
  assert.equal(displayName({ title: 'Mr.', firstName: 'Paolo' }), 'Mr. Paolo');
  assert.equal(displayName({ title: 'Mx.', firstName: 'Alex' }), 'Mx. Alex');
});

test('missing the title entirely still reads as a name, not a blank', () => {
  assert.equal(displayName({ firstName: 'Maricel' }), 'Ms. Maricel');
});

test('a record with nothing but a full name shows the full name', () => {
  // Rather than a bare "Ms." — the one thing worse than the wrong name.
  assert.equal(displayName({ name: 'Maricel Santos' }), 'Maricel Santos');
  assert.equal(displayName({}), '');
});

// -------------------------------------------------------------- the fallback

test('a row that never got a display name shows its legal name', () => {
  assert.equal(shownName({ name: 'Maricel Santos' }), 'Maricel Santos');
  assert.equal(shownName({ displayName: '', name: 'Maricel Santos' }), 'Maricel Santos');
  assert.equal(shownName({ displayName: '   ', name: 'Maricel Santos' }), 'Maricel Santos');
  assert.equal(shownName({ displayName: null, name: 'Maricel Santos' }), 'Maricel Santos');
});

test('and one that has it uses it', () => {
  assert.equal(shownName({ displayName: 'Ms. Jen', name: 'Jennifer Ramos' }), 'Ms. Jen');
});

// ------------------------------------------------ splitting what is already there

test('an existing full name splits into a first name and a surname', () => {
  assert.deepEqual(splitFullName('Maricel Santos'), {
    firstName: 'Maricel', middleName: '', lastName: 'Santos',
  });
});

test('a multi-word surname stays whole rather than being guessed apart', () => {
  // "Grace Delos Reyes" could be a two-word surname or a middle name and a
  // surname. Guessing wrong puts the wrong thing on a payslip, so the middle
  // name is left for a person to fill in.
  assert.deepEqual(splitFullName('Grace Delos Reyes'), {
    firstName: 'Grace', middleName: '', lastName: 'Delos Reyes',
  });
});

test('one word is a first name, not a surname', () => {
  assert.deepEqual(splitFullName('Maricel'), {
    firstName: 'Maricel', middleName: '', lastName: '',
  });
});

test('stray spacing does not become part of the name', () => {
  assert.deepEqual(splitFullName('  Maricel   Santos  '), {
    firstName: 'Maricel', middleName: '', lastName: 'Santos',
  });
});

// --------------------------------------------------------------- round trip

test('splitting and reassembling an old name gives it back unchanged', () => {
  // The migration does exactly this, and a name that came out different would
  // be a name quietly altered on someone's employment record.
  for (const name of ['Maricel Santos', 'Grace Delos Reyes', 'Joy Mendoza', 'Angelica Corporal']) {
    assert.equal(legalName(splitFullName(name)), name);
  }
});
