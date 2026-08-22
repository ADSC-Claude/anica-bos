/**
 * The check that says "the books reconcile".
 *
 * Runs in CI against the seeded dataset and is the same command used after a
 * restore — so the thing that proves a restore worked is exercised constantly
 * rather than written once and trusted.
 */
import { prisma } from '../src/lib/db';
import { formatPeso } from '../src/lib/money';
import { toDateKey } from '../src/lib/datetime';

let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  console.info(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  console.info('\nVerifying…\n');

  // 1 — no two spans may overlap on one property. The exclusion constraint
  // makes this impossible; checking anyway is how you find out a migration was
  // skipped on the environment you just restored into.
  const overlaps = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "CalendarSpan" a
    JOIN "CalendarSpan" b
      ON a."propertyId" = b."propertyId"
     AND a.id < b.id
     AND daterange(a."checkIn", a."checkOut", '[)') && daterange(b."checkIn", b."checkOut", '[)')
  `;
  check('no overlapping calendar spans', Number(overlaps[0].count) === 0, `${overlaps[0].count} found`);

  // 2 — the constraint itself is present.
  const constraint = await prisma.$queryRaw<{ conname: string }[]>`
    SELECT conname FROM pg_constraint WHERE conname = 'CalendarSpan_no_overlap'
  `;
  check('the exclusion constraint exists', constraint.length === 1);

  // 3 — every occupying reservation holds exactly one span, and no cancelled
  // reservation holds any.
  const holding = await prisma.reservation.findMany({
    where: { status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] } },
    select: { id: true, reference: true, span: { select: { id: true } } },
  });
  const missing = holding.filter((r) => !r.span);
  check('every live reservation holds its dates', missing.length === 0, missing.map((m) => m.reference).join(', '));

  const released = await prisma.reservation.count({
    where: { status: { in: ['CANCELLED', 'NO_SHOW'] }, span: { isNot: null } },
  });
  check('cancelled reservations hold nothing', released === 0, `${released} still holding`);

  // 4 — paidCents is a cache of the payment rows. If it drifts, every balance
  // shown to a guest is wrong.
  const reservations = await prisma.reservation.findMany({
    select: {
      id: true,
      reference: true,
      totalCents: true,
      paidCents: true,
      payments: { where: { status: { in: ['PAID', 'REFUNDED'] }, kind: { not: 'SECURITY_DEPOSIT' } }, select: { amountCents: true } },
    },
  });
  const drifted = reservations.filter(
    (r) => r.paidCents !== r.payments.reduce((a, p) => a + p.amountCents, 0),
  );
  check(
    'paidCents matches the payment rows',
    drifted.length === 0,
    drifted.slice(0, 3).map((d) => `${d.reference}: ${formatPeso(d.paidCents)}`).join(', '),
  );

  // 5 — the itemised breakdown adds up to the total the guest agreed to.
  const withLines = await prisma.reservation.findMany({
    where: { lines: { some: {} } },
    select: { reference: true, totalCents: true, lines: { select: { amountCents: true } } },
  });
  const unbalanced = withLines.filter(
    (r) => r.lines.reduce((a, l) => a + l.amountCents, 0) !== r.totalCents,
  );
  check(
    'every breakdown sums to its total',
    unbalanced.length === 0,
    unbalanced.slice(0, 3).map((u) => u.reference).join(', '),
  );

  // 6 — nights match the dates. A stored count that disagrees with the range
  // means ADR and occupancy are both wrong.
  const badNights = reservations.length
    ? await prisma.$queryRaw<{ reference: string }[]>`
        SELECT reference FROM "Reservation"
        WHERE nights <> ("checkOut" - "checkIn")
      `
    : [];
  check('nights match the date range', badNights.length === 0, badNights.map((b) => b.reference).join(', '));

  // 7 — inventory stock is the running sum of its movements.
  const items = await prisma.inventoryItem.findMany({
    select: { name: true, stockQty: true, movements: { select: { quantity: true } } },
  });
  const stockDrift = items.filter(
    (i) => i.stockQty !== i.movements.reduce((a, m) => a + m.quantity, 0),
  );
  check(
    'stock counts match the movement ledger',
    stockDrift.length === 0,
    stockDrift.slice(0, 3).map((s) => s.name).join(', '),
  );

  // 8 — a span belongs to exactly one thing.
  const orphans = await prisma.calendarSpan.count({
    where: { AND: [{ reservationId: null }, { blockId: null }] },
  });
  check('no span without an owner', orphans === 0, `${orphans} orphaned`);

  // 9 — properties that claim to be READY have no open turnover work.
  const readyButBusy = await prisma.property.findMany({
    where: {
      readyState: 'READY',
      OR: [
        { cleanings: { some: { status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'INSPECTION'] } } } },
        { inspections: { some: { status: { in: ['PENDING', 'IN_PROGRESS', 'NEEDS_ATTENTION', 'FAILED'] } } } },
      ],
    },
    select: { name: true },
  });
  check(
    'nothing claims READY with turnover work open',
    readyButBusy.length === 0,
    readyButBusy.map((p) => p.name).join(', '),
  );

  const [properties, guests, reservationCount, spans] = await Promise.all([
    prisma.property.count(),
    prisma.guest.count(),
    prisma.reservation.count(),
    prisma.calendarSpan.count(),
  ]);
  console.info(
    `\n  ${properties} properties · ${guests} guests · ${reservationCount} reservations · ${spans} spans`,
  );
  const earliest = await prisma.reservation.findFirst({ orderBy: { checkIn: 'asc' }, select: { checkIn: true } });
  const latest = await prisma.reservation.findFirst({ orderBy: { checkOut: 'desc' }, select: { checkOut: true } });
  if (earliest && latest) {
    console.info(`  calendar spans ${toDateKey(earliest.checkIn)} → ${toDateKey(latest.checkOut)}`);
  }

  if (failures) {
    console.error(`\n✗ ${failures} check(s) failed.\n`);
    process.exit(1);
  }
  console.info('\n✓ Everything reconciles.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
