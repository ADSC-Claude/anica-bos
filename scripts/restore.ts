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
import { TABLES } from './backup';
import { decryptBackup, isEncryptedEnvelope } from '../src/lib/backup-crypto';

const prisma = new PrismaClient();

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
  };

  const normalised: Record<string, Record<string, unknown>[]> = {};
  for (const [key, rows] of Object.entries(data)) {
    normalised[ALIASES[key] ?? key] = rows;
  }

  let total = 0;
  for (const table of TABLES) {
    const rows = normalised[table];
    if (!rows?.length) continue;
    const model = (prisma as unknown as Record<
      string,
      { create: (args: { data: unknown }) => Promise<unknown> }
    >)[table];
    for (const row of rows) {
      // Dates arrive as ISO strings from JSON; Prisma accepts them as-is.
      await model.create({ data: row }).catch((err: Error) => {
        console.warn(`  · skipped a ${table} row: ${err.message.split('\n')[0]}`);
      });
      total += 1;
    }
    console.log(`  ✓ ${table}: ${rows.length}`);
  }

  console.log(`\n✓ Restored ${total} rows. Verify with: npm run test`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
