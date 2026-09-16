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
 * The production build runs this itself, right after the migration that
 * creates the tables, so there is no deploy step to remember — see
 * scripts/build.mjs. It is create-only precisely so that running it on every
 * build is safe. By hand:
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

  /*
   * One statement per table, not one per row.
   *
   * Found in a preview build, which is the only place the shape of this was
   * ever going to show: the build runs in Washington and the database is in
   * Singapore, so a row at a time is ninety round trips of about six hundred
   * milliseconds, and the build's sixty-second deadline killed it forty rows
   * short. **A half-stocked pair of tables is worse than an empty one.** The
   * reader falls back to the book in the code only when a table is *empty*
   * (`fontBook`), and the faces are written before the sets — so what
   * actually happened was forty-nine faces, one pairing, and a reader that
   * used the rows as it found them. Every design set in any of the other
   * forty pairings would have lost its faces.
   *
   * `createMany` makes each table one statement, so there is no half-way:
   * either the rows are there or the table is untouched and the fallback is
   * the honest one. `skipDuplicates` keeps this create-only without a
   * second round trip to ask what exists.
   *
   * `--refresh` still goes a row at a time, because an update is per row and
   * there is no batched form of it. That is a command somebody runs on
   * purpose, at a terminal, with no deadline over it — not the build path.
   */
  const newFaces = book.faces
    .filter((f) => !haveFaces.has(f.key))
    .map((f) => ({ ...f, source: f.source === 'file' ? ('FILE' as const) : ('GOOGLE' as const) }));
  const newSets = book.sets.filter((s) => !haveSets.has(s.key)).map((s) => ({ ...s, minTier: s.minTier as Tier }));

  for (const f of newFaces) console.info(`  face  + ${f.key.padEnd(24)} ${f.family}`);
  for (const s of newSets) console.info(`  set   + ${s.key.padEnd(24)} ${s.name}`);
  if (!dry && newFaces.length) await prisma.fontFace.createMany({ data: newFaces, skipDuplicates: true });
  if (!dry && newSets.length) await prisma.fontSet.createMany({ data: newSets, skipDuplicates: true });
  made = newFaces.length + newSets.length;

  if (refresh) {
    for (const f of book.faces) {
      if (!haveFaces.has(f.key)) continue;
      const data = { ...f, source: f.source === 'file' ? ('FILE' as const) : ('GOOGLE' as const) };
      if (!dry) await prisma.fontFace.update({ where: { key: f.key }, data });
      redone++;
      console.info(`  face  ~ ${f.key.padEnd(24)} ${f.family}`);
    }
    for (const s of book.sets) {
      if (!haveSets.has(s.key)) continue;
      const data = { ...s, minTier: s.minTier as Tier };
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
