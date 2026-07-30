/**
 * Nightly backup: writes a timestamped JSON dump of every table to /backups.
 * Schedule with cron:  0 2 * * *  cd /path/to/app && npm run backup
 */
import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `anica-backup-${stamp}.json`);
  await writeFile(
    file,
    JSON.stringify({ exportedAt: new Date().toISOString(), schemaVersion: 1, data }, null, 1),
  );

  const rows = Object.values(data).reduce((a, b) => a + b.length, 0);
  console.log(`✓ Backed up ${rows} rows across ${TABLES.length} tables to ${file}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
