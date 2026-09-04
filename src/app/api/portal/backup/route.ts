import { handle, requireApi, assert } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { encryptBackup, passphraseProblem, samePassphrase } from '@/lib/backup-crypto';
import { readAllTables } from '@/lib/backup-tables';

export const dynamic = 'force-dynamic';

/**
 * Owner-only full backup: every table, including client health information —
 * this is the one export that contains it. Restore with
 * `npm run restore -- <file>`.
 *
 * POST rather than GET, and always encrypted. Both follow from what this file
 * is: the entire spa in one download, health records included. A GET is a link
 * that can be prefetched by a browser, sat in history, and shared without being
 * opened; and a passphrase does not belong in a URL. The client consent form
 * now states that health information leaves the spa only inside an encrypted
 * backup, so there is deliberately no way from here to produce a readable one.
 */
export const POST = handle(async (req) => {
  const user = await requireApi('settings.critical');

  const form = await req.formData().catch(() => null);
  assert(form, 400, 'Invalid request.');

  const passphrase = String(form.get('passphrase') ?? '');
  const confirm = String(form.get('passphraseConfirm') ?? '');

  const problem = passphraseProblem(passphrase);
  assert(!problem, 400, problem ?? '');
  assert(
    samePassphrase(passphrase, confirm),
    400,
    'The two passphrases do not match. A backup nobody can open is not a backup.',
  );

  // One list, shared with the nightly CLI. This route used to spell out all
  // eighty tables by hand and had already fallen two behind the schema.
  const data = await readAllTables(prisma);

  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: user.email,
    schemaVersion: 1,
    data,
  };

  const now = new Date();
  const envelope = await encryptBackup(JSON.stringify(payload, null, 1), passphrase, now);

  await audit(user, {
    module: 'settings',
    action: 'full_backup',
    entityType: 'Backup',
    summary:
      'Downloaded a full, encrypted data backup (includes client health information)',
    sensitive: true,
  });

  const date = now.toISOString().slice(0, 10);
  return new Response(JSON.stringify(envelope), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="anica-backup-${date}.json.enc"`,
      'Cache-Control': 'no-store',
    },
  });
});
