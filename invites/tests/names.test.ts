import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replyIdentity, sameName } from '../src/lib/names';

test('two spellings of one name are one person', () => {
  assert.equal(sameName('Ma. Teresa Santos', 'Ma Teresa Santos'), true, 'punctuation');
  assert.equal(sameName('MARIA SANTOS', 'maria santos'), true, 'case');
  assert.equal(sameName('Maria  Santos', ' Maria Santos '), true, 'spacing');
  assert.equal(sameName('José Cruz', 'Jose Cruz'), true, 'accents');
  assert.equal(sameName('Mr. & Mrs. Dela Cruz', 'Mr and Mrs Dela Cruz'), false, '“&” is not “and” — that is a guess');
});

test('a nickname is a real difference and is kept', () => {
  assert.equal(sameName('Fred', 'Atty. Federico Bautista'), false);
  assert.equal(sameName('Kevin Tan', 'Kevin & Nicole Tan'), false, 'one half of a couple');
});

test('the couple’s name is the identity, the typed one rides along', () => {
  // The case the owner asked about: a guest types over their own name.
  assert.deepEqual(replyIdentity('Fred', 'Atty. Federico Bautista'), {
    name: 'Atty. Federico Bautista',
    alias: 'Fred',
  });

  // Typed it the same way, give or take: nothing to show beside it.
  assert.deepEqual(replyIdentity('maria santos', 'Maria Santos'), { name: 'Maria Santos', alias: '' });
  assert.deepEqual(replyIdentity('Ma. Teresa', 'Ma Teresa'), { name: 'Ma Teresa', alias: '' });
});

test('a reply with no guest behind it keeps the only name it has', () => {
  // The public link: nobody to disagree with, so the typed name stands alone.
  assert.deepEqual(replyIdentity('Ana Villanueva', null), { name: 'Ana Villanueva', alias: '' });
  assert.deepEqual(replyIdentity('Ana Villanueva', undefined), { name: 'Ana Villanueva', alias: '' });
  assert.deepEqual(replyIdentity('Ana Villanueva', ''), { name: 'Ana Villanueva', alias: '' });
});

test('a blank from the guest never blanks the row', () => {
  // Whitespace where a name should be: the guest list still names them.
  assert.deepEqual(replyIdentity('   ', 'Lola Nena Santos'), { name: 'Lola Nena Santos', alias: '' });
  assert.deepEqual(replyIdentity('', 'Lola Nena Santos'), { name: 'Lola Nena Santos', alias: '' });
});

test('an alias is only ever shown when there is something to say', () => {
  // Whatever the pair, the printed name is never empty when either is present,
  // and an alias never repeats the name beside it.
  const pairs: [string, string | null][] = [
    ['Fred', 'Atty. Federico Bautista'],
    ['Maria Santos', 'Maria Santos'],
    ['Ana', null],
    ['', 'Lola Nena'],
  ];
  for (const [typed, listed] of pairs) {
    const id = replyIdentity(typed, listed);
    assert.ok(id.name.length > 0, `${typed} / ${listed}`);
    assert.equal(Boolean(id.alias) && sameName(id.alias, id.name), false, 'no alias that is the same name');
  }
});
