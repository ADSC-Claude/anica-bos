/**
 * Installs the starting stock of faces and pairings into a database.
 *
 * Unlike the design catalogue, this list is not the permanent truth: once
 * the tables exist the owner edits them in the admin, and that is the whole
 * point of the phase. So this **creates what is missing and leaves what is
 * there alone** — a re-run after she has retuned Cormorant's weights must
 * not put the developer's guess back. `--refresh` overwrites a row from the
 * code's book, for the one case where that is what you want: a face the code
 * has fixed and nobody has touched.
 *
 *   npm run db:fonts              # add what is missing
 *   npm run db:fonts -- --dry     # say what it would add
 *   npm run db:fonts -- --refresh # also overwrite rows that exist
 */
import { PrismaClient, type Tier } from '@prisma/client';
import { resolveDatabaseUrl } from '../src/lib/db-url';
import { builtInBook } from '../src/lib/fonts';

const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl(process.env.DATABASE_URL) });
const dry = process.argv.includes('--dry');
const refresh = process.argv.includes('--refresh');

async function main() {
  const book = builtInBook();
  const haveFaces = new Set((await prisma.fontFace.findMany({ select: { key: true } })).map((f) => f.key));
  const haveSets = new Set((await prisma.fontSet.findMany({ select: { key: true } })).map((s) => s.key));
  let made = 0;
  let redone = 0;

  for (const f of book.faces) {
    const data = { ...f, source: f.source === 'file' ? ('FILE' as const) : ('GOOGLE' as const) };
    if (!haveFaces.has(f.key)) {
      if (!dry) await prisma.fontFace.create({ data });
      made++;
      console.info(`  face  + ${f.key.padEnd(24)} ${f.family}`);
    } else if (refresh) {
      if (!dry) await prisma.fontFace.update({ where: { key: f.key }, data });
      redone++;
      console.info(`  face  ~ ${f.key.padEnd(24)} ${f.family}`);
    }
  }

  for (const s of book.sets) {
    const data = { ...s, minTier: s.minTier as Tier };
    if (!haveSets.has(s.key)) {
      if (!dry) await prisma.fontSet.create({ data });
      made++;
      console.info(`  set   + ${s.key.padEnd(24)} ${s.name}`);
    } else if (refresh) {
      if (!dry) await prisma.fontSet.update({ where: { key: s.key }, data });
      redone++;
      console.info(`  set   ~ ${s.key.padEnd(24)} ${s.name}`);
    }
  }

  const strangers = [...haveSets].filter((k) => !book.sets.some((s) => s.key === k));
  for (const k of strangers) console.info(`  set     ${k.padEnd(24)} (hers, left alone)`);
  console.info(`\n${dry ? 'Would add' : 'Added'} ${made}${refresh ? `, ${dry ? 'would refresh' : 'refreshed'} ${redone}` : ''}; ${strangers.length} of her own left alone.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
