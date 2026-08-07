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

const prisma = new PrismaClient();

// Every model in the schema, in dependency order for restore.
export const TABLES = [
  'branch', 'setting', 'account', 'user', 'employee', 'employeeSkill', 'employeeSchedule',
  'employeeCommissionRule', 'attendance', 'employeeLoan', 'loanPayment', 'payrollPeriod',
  'payslip', 'payslipLine', 'incentiveScheme', 'incentiveResult', 'serviceCategory', 'service',
  'resource', 'itemCategory', 'unit', 'supplier', 'item', 'serviceRecipe', 'supplierItem',
  'supplierPriceChange', 'stockMovement', 'purchaseOrder', 'purchaseOrderLine', 'stockTake',
  'stockTakeLine', 'clientFieldDefinition', 'client', 'clientFieldValue', 'clientFeedback',
  'clientFollowUp', 'corporateAccount', 'corporateAccountClient', 'corporateStatement',
  'corporatePayment', 'partner', 'appointment', 'appointmentService', 'receiptSeries',
  'discountPreset', 'package', 'packageItem', 'sale', 'saleLine', 'saleDiscount', 'payment',
  'commission', 'loyaltyTransaction', 'clientPackage', 'clientPackageEntitlement',
  'giftCertificate', 'giftCertificateRedemption', 'voucherBatch', 'voucher', 'voucherRedemption',
  'promo', 'expenseCategory', 'expense', 'pettyCashTxn', 'pettyCashRequest', 'eodClosing',
  'journalEntry', 'journalLine', 'notification', 'announcement', 'announcementRead',
  'directMessage', 'shiftNote', 'shiftNoteComment', 'emailLog', 'holiday', 'kpiTarget',
  'permit', 'auditLog', 'loginEvent',
] as const;

async function main() {
  const dir = process.env.BACKUP_DIR ?? path.join(process.cwd(), 'backups');
  await mkdir(dir, { recursive: true });

  const data: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const model = (prisma as unknown as Record<string, { findMany: () => Promise<unknown[]> }>)[table];
    data[table] = await model.findMany();
  }

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
  console.log(`✓ Backed up ${rows} rows across ${TABLES.length} tables to ${file}`);
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
 * `restore.ts` imports TABLES from here for the dependency order, and a
 * top-level `main()` turned that import into a side effect: every restore
 * quietly dumped the target database first. On a populated database with no
 * passphrase set, that is an unrequested plaintext copy of every client health
 * record, written to disk by a command that never mentioned backing anything
 * up. The restore log said "Backed up 15 rows" in the middle of a restore,
 * which is the sort of line you read past for a year.
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
