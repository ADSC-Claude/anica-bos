/**
 * Reading the list of accounts a manual reservation fee may be sent to.
 *
 * The thing being guarded is that blank lines and stray spacing never become an
 * account: a guest shown an empty "Bank:" line has been given somewhere to send
 * money that does not exist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transferAccounts, transferAccountsSentence } from '../src/lib/transfer-accounts';

test('one account per line, in the order they were written', () => {
  const raw = 'BDO • ANICA Wellness Spa • 1234 5678 9012\nBPI • ANICA Wellness Spa • 9876 5432 1098';
  assert.deepEqual(transferAccounts(raw), [
    'BDO • ANICA Wellness Spa • 1234 5678 9012',
    'BPI • ANICA Wellness Spa • 9876 5432 1098',
  ]);
});

test('blank lines and padding are spacing, not accounts', () => {
  const raw = '\n  BDO • 1234  \n\n\n   \nBPI • 9876\n';
  assert.deepEqual(transferAccounts(raw), ['BDO • 1234', 'BPI • 9876']);
});

test('a single bank still works, and an empty setting offers nothing', () => {
  assert.deepEqual(transferAccounts('BDO • 1234'), ['BDO • 1234']);
  assert.deepEqual(transferAccounts(''), []);
  assert.deepEqual(transferAccounts('   \n  '), []);
});

test('windows line endings do not leave a carriage return on the account', () => {
  // Settings are typed into a browser textarea, which is where CRLF comes from.
  assert.deepEqual(transferAccounts('BDO • 1234\r\nBPI • 9876'), ['BDO • 1234', 'BPI • 9876']);
});

test('the one-line form separates with semicolons, since accounts contain commas', () => {
  const raw = 'BDO • ANICA, Inc. • 1234\nBPI • ANICA, Inc. • 9876';
  assert.equal(
    transferAccountsSentence(raw),
    'BDO • ANICA, Inc. • 1234; BPI • ANICA, Inc. • 9876',
  );
  assert.equal(transferAccountsSentence(''), '');
});
