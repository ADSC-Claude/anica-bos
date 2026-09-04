import test from 'node:test';
import assert from 'node:assert/strict';
import { cardTitleSize, CARD_INTRO_MAX } from '../src/lib/card';

test('a short pair of names gets the full size', () => {
  assert.equal(cardTitleSize('Ana & Ben'), 96);
  assert.equal(cardTitleSize('Juan & Maria'), 96);
});

test('the title shrinks as it lengthens, never the other way', () => {
  const titles = ['Ana & Ben', 'Maria & Juan', 'Katherine & Joshua', 'Ma. Cristina & Bernardo', 'Ma. Christine Anne & Christopher Emmanuel'];
  const sizes = titles.map(cardTitleSize);
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i] <= sizes[i - 1], `${titles[i]} (${sizes[i]}) must not be larger than ${titles[i - 1]} (${sizes[i - 1]})`);
  }
  assert.equal(sizes.at(-1), 54, 'the longest realistic pair of Filipino names gets the smallest size');
});

test('the longest title still fits two lines on a 936px canvas', () => {
  // 1080 less 72px of padding on each side. A rough average advance of 0.5em
  // is enough to catch a size that would wrap to three lines.
  const longest = 'Ma. Christine Anne & Christopher Emmanuel';
  const width = [...longest].length * cardTitleSize(longest) * 0.5;
  assert.ok(width / 936 <= 2, `wraps to ${Math.ceil(width / 936)} lines`);
});

test('a title of emoji is measured by character, not by code unit', () => {
  // '👰🤵' is two characters but four UTF-16 units; measuring by .length would
  // pick a smaller size than the title needs.
  assert.equal(cardTitleSize('👰 & 🤵'), 96);
});

test('the intro cap leaves room for the date and the venue below it', () => {
  assert.equal(CARD_INTRO_MAX, 140);
  const lines = Math.ceil((CARD_INTRO_MAX * 30 * 0.5) / 800);
  assert.ok(lines <= 3, `${lines} lines of intro does not fit the budget`);
});
