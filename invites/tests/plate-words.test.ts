import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plateWords } from '../src/components/invite/renderer';
import { LOOK_BY_KEY } from '../src/lib/looks';
import { withWords, wordsOf } from '../src/lib/design';
import { PREMIUM_OPENING_BY_KEY } from '../src/lib/premium-openings';
import type { Content } from '../src/lib/sections';

// The words a premium card carries are one function for the guest page and
// the gallery's preview, so the sample a visitor watches is the demo's form
// as a guest would get it.

test('a christening card reads the design\'s cover line, the nickname and the dotted date', () => {
  const content = { cover: { childFull: 'Lucas Andrei Santos', childNick: 'Lucas', date: '2026-11-07' } } as unknown as Content;
  const look = withWords(LOOK_BY_KEY.romance, wordsOf({ en: { cover: 'The christening of' } }));
  const w = plateWords('CHRISTENING', content, 'en', look, PREMIUM_OPENING_BY_KEY['baby-blue-bow']);
  assert.equal(w.line, 'The christening of');
  assert.deepEqual(w.names, ['Lucas']);
  assert.equal(w.date, '11 · 07 · 26');
  assert.equal(w.monogram, '');
});

test('a wedding card on the seal keeps the opening\'s own line, both names and the joiner', () => {
  const content = { cover: { brideFirst: 'Maria', groomFirst: 'Juan', monogram: 'J & M', date: '2026-11-22' } } as unknown as Content;
  const w = plateWords('WEDDING', content, 'en', LOOK_BY_KEY.heritage, PREMIUM_OPENING_BY_KEY.capiz);
  assert.equal(w.monogram, 'J & M');
  assert.equal(w.line, 'You are invited');
  assert.deepEqual(w.names, ['Maria', 'Juan']);
  assert.equal(w.date, '11 · 22 · 26');
  assert.equal(w.and, 'and');
});

test('the couple\'s own opening line wins over the design\'s', () => {
  const content = { cover: { childNick: 'Amara', date: '2026-11-22', openingLine: 'Come celebrate with us' } } as unknown as Content;
  const w = plateWords('CHRISTENING', content, 'en', LOOK_BY_KEY.romance, PREMIUM_OPENING_BY_KEY['baby-blue-bow']);
  assert.equal(w.line, 'Come celebrate with us');
});
