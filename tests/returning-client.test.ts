/**
 * Recognising a guest without becoming a directory of guests.
 *
 * The rule is: the mobile number is the key and the name is the check, and
 * both have to agree. These tests are mostly about the second half — the ways
 * a real person writes her own name differently on two different days, and the
 * ways somebody who is not her would fail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { namesMatch, normaliseMobile } from '../src/lib/returning-client';

test('a number is the same number however it is written', () => {
  assert.equal(normaliseMobile('0917 123 4567'), '09171234567');
  assert.equal(normaliseMobile('+63 917 123 4567'), '09171234567');
  assert.equal(normaliseMobile('63 917 123 4567'), '09171234567');
  assert.equal(normaliseMobile('9171234567'), '09171234567');
  assert.equal(normaliseMobile('(0917) 123-4567'), '09171234567');
});

test('nothing in, nothing out', () => {
  assert.equal(normaliseMobile(''), '');
  assert.equal(normaliseMobile('not a number'), '');
});

test('the same name typed the same way matches', () => {
  assert.equal(namesMatch('Maria Santos', 'Maria Santos'), true);
  assert.equal(namesMatch('maria santos', 'MARIA SANTOS'), true);
  assert.equal(namesMatch('  Maria   Santos ', 'Maria Santos'), true);
});

test('a middle name that comes and goes does not lock her out', () => {
  // She booked as "Maria Santos" in March and "Maria Cruz Santos" in August.
  // She is one guest, and being told otherwise is a small humiliation.
  assert.equal(namesMatch('Maria Cruz Santos', 'Maria Santos'), true);
  assert.equal(namesMatch('Maria Santos', 'Maria Cruz Santos'), true);
});

test('accents and punctuation are not a test of identity', () => {
  assert.equal(namesMatch('Jose Peña', 'Jose Pena'), true);
  assert.equal(namesMatch("Mary-Anne O'Brien", 'Mary Anne OBrien'), true);
});

test('a different person does not match', () => {
  assert.equal(namesMatch('Maria Santos', 'Juan Santos'), false, 'same surname only');
  assert.equal(namesMatch('Maria Santos', 'Maria Cruz'), false, 'same first name only');
  assert.equal(namesMatch('Maria Santos', 'Ana Reyes'), false);
});

test('a blank name never matches, so an empty box cannot walk in', () => {
  assert.equal(namesMatch('', 'Maria Santos'), false);
  assert.equal(namesMatch('   ', 'Maria Santos'), false);
  assert.equal(namesMatch('Maria Santos', ''), false);
  assert.equal(namesMatch('!!!', 'Maria Santos'), false, 'punctuation is not a name');
});

test('reversed order is not the same person', () => {
  // "Santos Maria" is a different claim from "Maria Santos", and guessing
  // which way round somebody meant it is how the wrong record gets used.
  assert.equal(namesMatch('Santos Maria', 'Maria Santos'), false);
});
