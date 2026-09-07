/**
 * Installs the design catalogue into a database that already has customers.
 *
 * The seed TRUNCATEs every table, so it can only ever run against an empty
 * database — which makes it useless for shipping a new design to production.
 * This does the other half: upsert each row of prisma/templates.ts by slug,
 * and touch nothing else. No invitation, order or account is read or written.
 *
 * A template already in the database keeps its id, so every invitation built
 * on it keeps rendering; only the design fields are refreshed.
 *
 * Designs in the database that are NOT in the catalogue are left alone and
 * listed at the end — one may have been created by hand in the admin, and
 * deleting a design would break the invitations pointing at it.
 *
 *   npm run db:templates            # apply
 *   npm run db:templates -- --dry   # show what would change
 */
import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from '../src/lib/db-url';
import { TEMPLATES, templateData } from '../prisma/templates';

const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl(process.env.DATABASE_URL) });
const dry = process.argv.includes('--dry');

async function main() {
  const existing = await prisma.template.findMany({ select: { id: true, slug: true, name: true } });
  const bySlug = new Map(existing.map((t) => [t.slug, t]));
  let created = 0;
  let updated = 0;

  for (const [i, t] of TEMPLATES.entries()) {
    const data = templateData(t, i);
    const found = bySlug.get(t.slug);
    if (found) {
      // `published` is deliberately not in the payload: if staff unpublished a
      // design in the admin, a sync must not put it back on the shop floor.
      if (!dry) await prisma.template.update({ where: { slug: t.slug }, data });
      updated++;
      console.info(`  updated  ${t.slug.padEnd(20)} ${t.name}`);
    } else {
      if (!dry) await prisma.template.create({ data });
      created++;
      console.info(`  created  ${t.slug.padEnd(20)} ${t.name}`);
    }
  }

  const extra = existing.filter((t) => !TEMPLATES.some((c) => c.slug === t.slug));
  for (const t of extra) console.info(`  kept     ${t.slug.padEnd(20)} ${t.name} (not in the catalogue)`);

  console.info(`\n${dry ? 'Would apply' : 'Applied'}: ${created} created, ${updated} updated, ${extra.length} left alone.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
