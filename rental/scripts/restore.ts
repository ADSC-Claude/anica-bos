/**
 * Loads a snapshot from `npm run backup` back into an empty database.
 *
 *   npx prisma migrate deploy
 *   npm run restore -- backups/2026-08-07.json
 *   npm run verify
 *
 * It refuses to run against a database that already has reservations unless
 * you pass --force. A restore over live data is a data-loss event, and the
 * confirmation is deliberately awkward.
 */
import { readFile } from 'node:fs/promises';
import { prisma } from '../src/lib/db';
import { TABLES } from './backup';

/** JSON has no Date. Anything that looks like an ISO instant becomes one. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function revive(value: unknown): unknown {
  if (typeof value === 'string' && ISO.test(value)) return new Date(value);
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
  }
  return value;
}

async function main() {
  const file = process.argv.find((a) => a.endsWith('.json'));
  const force = process.argv.includes('--force');
  if (!file) {
    console.error('Usage: npm run restore -- backups/<file>.json [--force]');
    process.exit(1);
  }

  const existing = await prisma.reservation.count();
  if (existing > 0 && !force) {
    console.error(
      `\n✗ This database already holds ${existing} reservations.\n` +
        '  Restoring would write over live records. Re-run with --force if that is genuinely what you want.\n',
    );
    process.exit(1);
  }

  const payload = JSON.parse(await readFile(file, 'utf8')) as {
    version: number;
    takenAt: string;
    source?: string;
    tables: Record<string, unknown[]>;
  };
  console.info(`\nRestoring a snapshot taken ${payload.takenAt}`);
  if (payload.source) console.info(`  from ${payload.source}\n`);

  const client = prisma as unknown as Record<
    string,
    { createMany: (args: { data: unknown[]; skipDuplicates: boolean }) => Promise<{ count: number }> }
  >;

  let total = 0;
  for (const table of TABLES) {
    const rows = payload.tables[table];
    if (!rows?.length) continue;
    // In insertion order, and in chunks, because a single createMany of tens of
    // thousands of rows exceeds the parameter limit.
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map(revive);
      const result = await client[table].createMany({ data: chunk, skipDuplicates: true });
      total += result.count;
    }
    console.info(`  ${table.padEnd(24)} ${rows.length}`);
  }

  console.info(`\n✓ ${total} rows restored.`);
  console.info('  Now run: npm run verify');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
