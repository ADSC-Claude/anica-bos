/**
 * A portable snapshot of every table, as JSON.
 *
 * This is the layer that survives losing the vendor: it restores into any
 * Postgres, not just the one it came from. Supabase PITR covers the "oh no" of
 * five minutes ago; this covers the "oh no" of the account being gone.
 *
 *   npm run backup                    → backups/2026-08-07T12-00-00.json
 *   npm run backup -- /tmp/out.json
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/lib/db';

// Order matters on restore, so it is recorded here rather than inferred.
export const TABLES = [
  'branch', 'user', 'userProperty', 'setting', 'amenity', 'property',
  'propertyPhoto', 'propertyAmenity', 'propertyFaq', 'rateOverride', 'addOn',
  'promotion', 'promotionProperty', 'guest', 'guestNote',
  'calendarBlock', 'reservation', 'calendarSpan', 'reservationLine',
  'reservationAddOn', 'payment', 'securityDeposit', 'promotionRedemption',
  'messageTemplate', 'scheduledMessage', 'checkInSubmission', 'companion',
  'accessRecord', 'review', 'campaign', 'campaignRecipient',
  'checklistTemplate', 'checklistItem', 'task', 'cleaningTask',
  'checklistResult', 'cleaningRestock', 'inspection', 'inspectionArea',
  'vendor', 'maintenanceTicket', 'incident', 'inventoryItem',
  'inventoryMovement', 'cleaningRestock', 'linenItem', 'linenMovement',
  'laundryBatch', 'laundryBatchLine', 'expenseCategory', 'expense',
  'document', 'attachment', 'icalFeed', 'icalEvent', 'notification',
  'auditLog', 'loginEvent',
] as const;

async function main() {
  const target =
    process.argv[2] ??
    path.join('backups', `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);

  const client = prisma as unknown as Record<string, { findMany: () => Promise<unknown[]> }>;
  const data: Record<string, unknown[]> = {};

  for (const table of new Set(TABLES)) {
    const rows = await client[table].findMany();
    data[table] = rows;
    console.info(`  ${table.padEnd(24)} ${rows.length}`);
  }

  const payload = {
    version: 1,
    takenAt: new Date().toISOString(),
    // Recorded so a restore into the wrong database is obvious, not silent.
    source: process.env.DATABASE_URL?.replace(/:\/\/[^@]+@/, '://***@') ?? 'unknown',
    tables: data,
  };

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(payload, null, 2));

  const total = Object.values(data).reduce((a, rows) => a + rows.length, 0);
  console.info(`\n✓ ${total} rows → ${target}`);
  console.info('  Keep a copy off this platform. That is the point of it.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
