/**
 * Nightly backup: writes a timestamped dump of every table to /backups.
 * Schedule with cron:  0 2 * * *  cd /path/to/app && npm run backup
 *
 * Set BACKUP_PASSPHRASE and the file is encrypted (AES-256-GCM) and written as
 * `.json.enc`. Without it the dump is plain JSON, and the script says so every
 * single run rather than letting a nightly cron quietly accumulate a year of
 * readable health records on a spare disk.
 *
 * Restore either kind with:  npm run restore -- <file>
 */
import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encryptBackup, passphraseProblem } from '../src/lib/backup-crypto';
import { JOIN_TABLES, TABLES, readAllTables } from '../src/lib/backup-tables';

const prisma = new PrismaClient();

async function main() {
  const dir = process.env.BACKUP_DIR ?? path.join(process.cwd(), 'backups');
  await mkdir(dir, { recursive: true });

  const data = await readAllTables(prisma);

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const payload = JSON.stringify(
    { exportedAt: now.toISOString(), schemaVersion: 1, data },
    null,
    1,
  );

  const passphrase = process.env.BACKUP_PASSPHRASE ?? '';
  let file: string;

  if (passphrase) {
    const problem = passphraseProblem(passphrase);
    if (problem) {
      // Refuse rather than fall back to plaintext. A cron job that silently
      // stopped encrypting is the worst of both worlds: nobody is watching, and
      // everybody believes the file is safe.
      console.error(`✗ BACKUP_PASSPHRASE rejected: ${problem}`);
      process.exit(1);
    }
    const envelope = await encryptBackup(payload, passphrase, now);
    file = path.join(dir, `anica-backup-${stamp}.json.enc`);
    await writeFile(file, JSON.stringify(envelope));
  } else {
    file = path.join(dir, `anica-backup-${stamp}.json`);
    await writeFile(file, payload);
  }

  const rows = Object.values(data).reduce((a, b) => a + b.length, 0);
  const tables = TABLES.length + JOIN_TABLES.length;
  console.log(`✓ Backed up ${rows} rows across ${tables} tables to ${file}`);
  if (passphrase) {
    console.log('  Encrypted. Without the passphrase this file cannot be restored — keep it somewhere other than the backup drive.');
  } else {
    console.warn(
      '  ⚠ NOT ENCRYPTED. This file contains every client health record in readable form.\n' +
        '    Set BACKUP_PASSPHRASE to encrypt it.',
    );
  }
}

/**
 * Only when this file is what was run.
 *
 * `restore.ts` used to import TABLES from here for the dependency order, and a
 * top-level `main()` turned that import into a side effect: every restore
 * quietly dumped the target database first. On a populated database with no
 * passphrase set, that is an unrequested plaintext copy of every client health
 * record, written to disk by a command that never mentioned backing anything
 * up. The restore log said "Backed up 15 rows" in the middle of a restore,
 * which is the sort of line you read past for a year.
 *
 * The shared list now lives in `src/lib/backup-tables`, so nothing imports this
 * file any more and the side effect is gone at the root. The guard stays: it
 * costs a function, and it means the next module to import something from here
 * does not silently reintroduce a plaintext dump of every health record.
 */
function runningDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(entry).href);
  } catch {
    return false;
  }
}

if (runningDirectly()) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
