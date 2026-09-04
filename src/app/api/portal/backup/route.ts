import { handle, requireApi } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { readAllTables } from '@/lib/backup-tables';

export const dynamic = 'force-dynamic';

/**
 * Owner-only full backup: every table as JSON, including client health
 * information — this is the one export that contains it. Restore with
 * `npm run restore -- <file>`.
 */
export const GET = handle(async () => {
  const user = await requireApi('settings.critical');

  // One list, shared with the nightly CLI. This route used to spell out all
  // eighty tables by hand and had already fallen two behind the schema.
  const data = await readAllTables(prisma);

  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: user.email,
    schemaVersion: 1,
    data,
  };

  await audit(user, {
    module: 'settings',
    action: 'full_backup',
    entityType: 'Backup',
    summary: 'Downloaded a full data backup (includes client health information)',
    sensitive: true,
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 1), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="anica-backup-${date}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});
