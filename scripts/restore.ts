/**
 * Restore from a backup file produced by `npm run backup` or the Owner's
 * full-backup download.
 *
 *   npm run restore -- ./backups/anica-backup-....json [--force]
 *
 * Encrypted backups (`.json.enc`, or any file written by an app that had a
 * passphrase set) are detected by their envelope rather than their extension —
 * a renamed file still restores. The passphrase comes from BACKUP_PASSPHRASE or
 * a `--passphrase=` argument.
 *
 * Refuses to run against a database that already holds data unless --force is
 * given, in which case existing rows are wiped first.
 */
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { decryptBackup, isEncryptedEnvelope } from '../src/lib/backup-crypto';
import { JOIN_TABLES, TABLES, writeJoinTable } from '../src/lib/backup-tables';

const prisma = new PrismaClient();

/**
 * The first line of a Prisma error that actually says something.
 *
 * `err.message.split('\n')[0]` returns the empty line Prisma opens with, so
 * every skipped row printed its table name and then nothing at all. Nine
 * hundred failures with no reason attached is not a log, it is a rumour.
 */
function reason(err: Error): string {
  const line = err.message
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? err.message.trim() ?? 'unknown error';
}

async function main() {
  const file = process.argv.find((a) => a.endsWith('.json') || a.endsWith('.json.enc'));
  const force = process.argv.includes('--force');
  if (!file) {
    console.error('Usage: npm run restore -- <backup.json|backup.json.enc> [--force]');
    process.exit(1);
  }

  let text = await readFile(file, 'utf8');
  const parsed: unknown = JSON.parse(text);

  // Detected from the envelope, not the file name. Someone will rename one.
  if (isEncryptedEnvelope(parsed)) {
    const fromArg = process.argv
      .find((a) => a.startsWith('--passphrase='))
      ?.slice('--passphrase='.length);
    const passphrase = fromArg ?? process.env.BACKUP_PASSPHRASE ?? '';
    if (!passphrase) {
      console.error(
        'This backup is encrypted. Provide the passphrase with BACKUP_PASSPHRASE=... or --passphrase=...',
      );
      process.exit(1);
    }
    console.log(`› Decrypting a backup written ${parsed.encryptedAt}…`);
    try {
      text = await decryptBackup(parsed, passphrase);
    } catch (e) {
      console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  }

  const raw = JSON.parse(text) as {
    data: Record<string, Record<string, unknown>[]>;
  };
  // The Owner's download nests differently from the CLI dump; accept both.
  const data = raw.data;

  const existing = await prisma.sale.count();
  if (existing > 0 && !force) {
    console.error(
      `Refusing to restore: the target database already has ${existing} sales.\n` +
        'Pass --force to wipe it first.',
    );
    process.exit(1);
  }

  if (force) {
    console.log('› Wiping the target database…');
    // Join rows first: they cascade from both ends, but deleting them up front
    // means the wipe does not depend on which end happens to go first.
    for (const join of JOIN_TABLES) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${join.table}"`).catch(() => undefined);
    }
    for (const table of [...TABLES].reverse()) {
      const model = (prisma as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[table];
      await model.deleteMany().catch(() => undefined);
    }
  }

  // Aliases so a download from the Owner's backup endpoint also restores.
  const ALIASES: Record<string, string> = {
    branches: 'branch', settings: 'setting', accounts: 'account', users: 'user',
    employees: 'employee', employeeSkills: 'employeeSkill', employeeSchedules: 'employeeSchedule',
    employeeCommissionRules: 'employeeCommissionRule', attendances: 'attendance',
    loans: 'employeeLoan', loanPayments: 'loanPayment', payrollPeriods: 'payrollPeriod',
    payslips: 'payslip', payslipLines: 'payslipLine', incentiveSchemes: 'incentiveScheme',
    incentiveResults: 'incentiveResult', serviceCategories: 'serviceCategory',
    services: 'service', serviceRecipes: 'serviceRecipe', resources: 'resource',
    clients: 'client', clientFieldDefinitions: 'clientFieldDefinition',
    clientFieldValues: 'clientFieldValue', clientFollowUps: 'clientFollowUp',
    corporateAccounts: 'corporateAccount', corporateAccountClients: 'corporateAccountClient',
    corporateStatements: 'corporateStatement', corporatePayments: 'corporatePayment',
    partners: 'partner', appointments: 'appointment', appointmentServices: 'appointmentService',
    sales: 'sale', saleLines: 'saleLine', saleDiscounts: 'saleDiscount', payments: 'payment',
    commissions: 'commission', discountPresets: 'discountPreset',
    loyaltyTransactions: 'loyaltyTransaction', packages: 'package', packageItems: 'packageItem',
    clientPackages: 'clientPackage', clientPackageEntitlements: 'clientPackageEntitlement',
    giftCertificates: 'giftCertificate', gcRedemptions: 'giftCertificateRedemption',
    voucherBatches: 'voucherBatch', vouchers: 'voucher', voucherRedemptions: 'voucherRedemption',
    promos: 'promo', itemCategories: 'itemCategory', units: 'unit', items: 'item',
    suppliers: 'supplier', supplierItems: 'supplierItem',
    supplierPriceChanges: 'supplierPriceChange', stockMovements: 'stockMovement',
    purchaseOrders: 'purchaseOrder', purchaseOrderLines: 'purchaseOrderLine',
    stockTakes: 'stockTake', stockTakeLines: 'stockTakeLine',
    expenseCategories: 'expenseCategory', expenses: 'expense', pettyCashTxns: 'pettyCashTxn',
    pettyCashRequests: 'pettyCashRequest', eodClosings: 'eodClosing',
    journalEntries: 'journalEntry', journalLines: 'journalLine', notifications: 'notification',
    announcements: 'announcement', announcementReads: 'announcementRead',
    directMessages: 'directMessage', shiftNotes: 'shiftNote',
    shiftNoteComments: 'shiftNoteComment', emailLogs: 'emailLog', holidays: 'holiday',
    kpiTargets: 'kpiTarget', permits: 'permit', auditLogs: 'auditLog', loginEvents: 'loginEvent',
    employmentEvents: 'employmentEvent',
  };

  const normalised: Record<string, Record<string, unknown>[]> = {};
  for (const [key, rows] of Object.entries(data)) {
    normalised[ALIASES[key] ?? key] = rows;
  }

  let total = 0;
  let failed = 0;
  for (const table of TABLES) {
    const rows = normalised[table];
    if (!rows?.length) continue;
    const model = (prisma as unknown as Record<
      string,
      { create: (args: { data: unknown }) => Promise<unknown> }
    >)[table];
    let written = 0;
    for (const row of rows) {
      // Dates arrive as ISO strings from JSON; Prisma accepts them as-is.
      await model
        .create({ data: row })
        .then(() => {
          written += 1;
        })
        .catch((err: Error) => {
          console.warn(`  · skipped a ${table} row: ${reason(err)}`);
        });
    }
    total += written;
    // Both numbers, always. Printing only the input count reported a clean
    // restore for rows that never went in.
    const lost = rows.length - written;
    console.log(`  ${lost ? '✗' : '✓'} ${table}: ${written}/${rows.length}`);
    if (lost) failed += lost;
  }

  // Last: both ends of every pair now exist.
  for (const join of JOIN_TABLES) {
    const rows = normalised[join.table];
    if (!rows?.length) continue;
    const written = await writeJoinTable(prisma, join, rows);
    total += written;
    const lost = rows.length - written;
    console.log(`  ${lost ? '✗' : '✓'} ${join.table}: ${written}/${rows.length}`);
    if (lost) failed += lost;
  }

  if (failed) {
    // Exit non-zero. This used to count every attempted row as restored and
    // finish with a tick, so a restore that dropped half the ledger looked
    // exactly like one that worked.
    console.error(
      `\n✗ Restored ${total} rows, but ${failed} did not go in. The database is incomplete.`,
    );
    process.exit(1);
  }

  console.log(`\n✓ Restored ${total} rows. Verify with: npm run test`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
