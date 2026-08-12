/**
 * What a full backup consists of — the single list, used by both the nightly
 * CLI (`scripts/backup.ts`) and the Owner's download (`/api/portal/backup`).
 *
 * There were two hand-written lists before this file, one in each caller, and
 * both had already drifted from the schema: neither carried `EmploymentEvent`
 * (added with employment history) nor `_AdditionalCategories` (added with
 * multi-category services). Both tables were empty, so the restore round-trip
 * passed and nothing looked wrong — a backup silently missing a table looks
 * exactly like a backup until the day you need it.
 *
 * `tests/backup-covers-schema.test.ts` compares this list against the generated
 * Prisma schema and fails when a new model is not in it, so the next table to
 * be added cannot go missing the same quiet way.
 */

/**
 * Every model, in dependency order: parents before the rows that point at them,
 * so a restore replaying this order top to bottom never lands a child first.
 *
 * Three entries sit somewhere other than where they read most naturally, and
 * all three are load-bearing. `employee` comes before `user`, because a staff
 * login carries an optional `employeeId` that in practice is always set.
 * `employeeCommissionRule` and `employeeSkill` come after `service` rather than
 * up with the other employee tables, because both point at a treatment.
 *
 * The order this replaced put `user` first, and every user failed its foreign
 * key on restore. Users are what sales hang off, so the sales went too, and the
 * payments, the commissions, and the entire double-entry journal after them:
 * 917 of 1,709 rows silently dropped, and the restore printed a tick.
 *
 * Optional foreign keys are the trap. A nullable column still needs its parent
 * present whenever it holds a value, so it constrains the order exactly as a
 * required one does. The ordering test checks both; don't tidy this back.
 */
export const TABLES = [
  'branch', 'setting', 'account', 'employee', 'user', 'employmentEvent', 'employeeSchedule',
  'attendance', 'employeeLoan', 'loanPayment', 'payrollPeriod', 'payslip', 'payslipLine',
  'incentiveScheme', 'incentiveResult', 'serviceCategory', 'service', 'employeeCommissionRule',
  'employeeSkill', 'resource', 'itemCategory', 'unit', 'supplier', 'item', 'serviceRecipe',
  'supplierItem', 'supplierPriceChange', 'stockMovement', 'purchaseOrder', 'purchaseOrderLine',
  'stockTake', 'stockTakeLine', 'clientFieldDefinition', 'client', 'clientFieldValue',
  'clientFeedback', 'clientFollowUp', 'corporateAccount', 'corporateAccountClient',
  'corporateStatement', 'corporatePayment', 'partner', 'appointment', 'appointmentService',
  'receiptSeries', 'discountPreset', 'package', 'packageItem', 'sale', 'saleLine',
  'saleDiscount', 'payment', 'commission', 'loyaltyTransaction', 'clientPackage',
  'clientPackageEntitlement', 'giftCertificate', 'giftCertificateRedemption', 'voucherBatch',
  'voucher', 'voucherRedemption', 'promo', 'expenseCategory', 'expense', 'pettyCashTxn',
  'pettyCashRequest', 'eodClosing', 'journalEntry', 'journalLine', 'notification',
  'announcement', 'announcementRead', 'directMessage', 'shiftNote', 'shiftNoteComment',
  'emailLog', 'holiday', 'kpiTarget', 'permit', 'auditLog', 'loginEvent',
] as const;

/**
 * Implicit many-to-many join tables.
 *
 * Prisma does not generate a model for these, so they have no `findMany` and
 * the loop over TABLES cannot see them — which is precisely how
 * `_AdditionalCategories` went missing. They hold nothing but two foreign keys,
 * but losing them loses which extra headings a treatment is listed under, and
 * that is a price list that silently changes on restore.
 *
 * Restored after everything else: both ends must already exist.
 */
export const JOIN_TABLES = [
  { table: '_AdditionalCategories', columns: ['A', 'B'] },
] as const;

export type JoinTable = (typeof JOIN_TABLES)[number];

/** Enough of a Prisma client for the two things this file does. */
type AnyPrisma = {
  $queryRawUnsafe<T>(sql: string, ...args: unknown[]): Promise<T>;
  $executeRawUnsafe(sql: string, ...args: unknown[]): Promise<number>;
};

function delegate(prisma: unknown, table: string) {
  const model = (prisma as Record<string, { findMany?: () => Promise<unknown[]> }>)[table];
  if (!model?.findMany) {
    // Reachable only if TABLES names something the schema no longer has. Fail
    // loudly: a backup that quietly skips a table is the bug this file exists
    // to prevent.
    throw new Error(`backup: no Prisma model for "${table}"`);
  }
  return model as { findMany: () => Promise<unknown[]> };
}

/** Read every table named above into one object, keyed by table name. */
export async function readAllTables(prisma: unknown): Promise<Record<string, unknown[]>> {
  const rows = await Promise.all(TABLES.map((t) => delegate(prisma, t).findMany()));

  const data: Record<string, unknown[]> = {};
  TABLES.forEach((t, i) => {
    data[t] = rows[i];
  });

  for (const join of JOIN_TABLES) {
    const cols = join.columns.map((c) => `"${c}"`).join(', ');
    data[join.table] = await (prisma as AnyPrisma).$queryRawUnsafe<unknown[]>(
      `SELECT ${cols} FROM "${join.table}"`,
    );
  }

  return data;
}

/** Insert previously backed-up join rows. Returns how many went in. */
export async function writeJoinTable(
  prisma: unknown,
  join: JoinTable,
  rows: Record<string, unknown>[],
): Promise<number> {
  const cols = join.columns.map((c) => `"${c}"`).join(', ');
  const params = join.columns.map((_, i) => `$${i + 1}`).join(', ');

  let written = 0;
  for (const row of rows) {
    // ON CONFLICT: the pair is the primary key, and a restore run twice should
    // not be the thing that fails.
    await (prisma as AnyPrisma)
      .$executeRawUnsafe(
        `INSERT INTO "${join.table}" (${cols}) VALUES (${params}) ON CONFLICT DO NOTHING`,
        ...join.columns.map((c) => row[c]),
      )
      .then(() => {
        written += 1;
      })
      .catch((err: Error) => {
        console.warn(`  · skipped a ${join.table} row: ${err.message.split('\n')[0]}`);
      });
  }
  return written;
}
