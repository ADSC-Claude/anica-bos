/**
 * Nightly backup: writes a timestamped JSON dump of every table to /backups.
 * Schedule with cron:  0 2 * * *  cd /path/to/app && npm run backup
 */
import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JOIN_TABLES, TABLES, readAllTables } from '../src/lib/backup-tables';

const prisma = new PrismaClient();

async function main() {
  const dir = process.env.BACKUP_DIR ?? path.join(process.cwd(), 'backups');
  await mkdir(dir, { recursive: true });

  const data = await readAllTables(prisma);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `anica-backup-${stamp}.json`);
  await writeFile(
    file,
    JSON.stringify({ exportedAt: new Date().toISOString(), schemaVersion: 1, data }, null, 1),
  );

  const rows = Object.values(data).reduce((a, b) => a + b.length, 0);
  const tables = TABLES.length + JOIN_TABLES.length;
  console.log(`✓ Backed up ${rows} rows across ${tables} tables to ${file}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
