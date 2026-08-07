/**
 * Encrypting the one file that holds every client health record.
 *
 * The round-trip is the least interesting test here. What matters is that the
 * failures fail: a wrong passphrase must not half-open the file, and a backup
 * somebody has edited must be refused rather than restored — silently loading
 * altered figures into the books is worse than not restoring at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptBackup,
  encryptBackup,
  isEncryptedEnvelope,
  passphraseProblem,
  samePassphrase,
  MIN_PASSPHRASE_LENGTH,
} from '../src/lib/backup-crypto';

const PASSPHRASE = 'a-long-enough-passphrase';
const NOW = new Date('2026-08-07T02:00:00.000Z');
const payload = JSON.stringify({
  data: { clients: [{ name: 'Maria', allergies: 'Penicillin' }] },
});

test('what goes in comes back out', async () => {
  const envelope = await encryptBackup(payload, PASSPHRASE, NOW);
  assert.equal(await decryptBackup(envelope, PASSPHRASE), payload);
});

test('nothing readable survives in the envelope', async () => {
  const envelope = await encryptBackup(payload, PASSPHRASE, NOW);
  const asText = JSON.stringify(envelope);
  assert.ok(!asText.includes('Penicillin'), 'the health answer must not be readable');
  assert.ok(!asText.includes('Maria'));
  assert.ok(!asText.includes(PASSPHRASE), 'the passphrase must not travel with the file');
});

test('the same text encrypted twice does not produce the same file', async () => {
  const a = await encryptBackup(payload, PASSPHRASE, NOW);
  const b = await encryptBackup(payload, PASSPHRASE, NOW);
  assert.notEqual(a.ciphertext, b.ciphertext, 'a fresh salt and IV each time');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
});

test('a wrong passphrase is refused, not partially honoured', async () => {
  const envelope = await encryptBackup(payload, PASSPHRASE, NOW);
  await assert.rejects(
    () => decryptBackup(envelope, 'not-the-right-passphrase'),
    /passphrase is wrong, or the file has been altered/,
  );
});

test('an altered backup is refused', async () => {
  const envelope = await encryptBackup(payload, PASSPHRASE, NOW);
  const raw = Buffer.from(envelope.ciphertext, 'base64');
  raw[0] ^= 0xff;
  const tampered = { ...envelope, ciphertext: raw.toString('base64') };
  await assert.rejects(() => decryptBackup(tampered, PASSPHRASE), /altered/);
});

test('a backup from a newer app says so instead of failing obscurely', async () => {
  const envelope = await encryptBackup(payload, PASSPHRASE, NOW);
  await assert.rejects(
    () => decryptBackup({ ...envelope, version: 99 }, PASSPHRASE),
    /newer version/,
  );
});

test('an encrypted file is recognised by its envelope, not its name', async () => {
  const envelope = await encryptBackup(payload, PASSPHRASE, NOW);
  assert.equal(isEncryptedEnvelope(envelope), true);
  assert.equal(isEncryptedEnvelope(JSON.parse(payload)), false, 'a plain dump is not one');
  assert.equal(isEncryptedEnvelope(null), false);
  assert.equal(isEncryptedEnvelope('anica-encrypted-backup'), false);
});

test('a guessable passphrase is refused before it protects anything', async () => {
  assert.ok(passphraseProblem(''));
  assert.ok(passphraseProblem('short'));
  assert.equal(passphraseProblem('x'.repeat(MIN_PASSPHRASE_LENGTH)), null);
  await assert.rejects(() => encryptBackup(payload, 'short', NOW), /at least/);
});

test('the confirmation field compares whole strings', () => {
  assert.equal(samePassphrase(PASSPHRASE, PASSPHRASE), true);
  assert.equal(samePassphrase(PASSPHRASE, PASSPHRASE + ' '), false);
  assert.equal(samePassphrase(PASSPHRASE, ''), false);
});
