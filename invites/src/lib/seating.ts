import { seatsHeld, type SeatReply } from './seats';

/**
 * The seating chart's arithmetic, kept apart from the page that draws it.
 *
 * Three numbers sit at the top of the tab — Tables · Seated · Empty seats —
 * and every table card repeats the middle one against its own capacity. All
 * of them count through seatsHeld, so the chart agrees with the guest list,
 * the check-in desk and the headcount sheet about what a guest is holding:
 * the seats they confirmed once they reply, the seats set aside for them
 * before that, and none at all once they decline.
 *
 * No `server-only` and no Prisma, on purpose: the page works the counters
 * out on the server and the chart works them out again in the browser as
 * names move, and the two have to reach the same answer.
 */

export type SeatingTableRow = { id: string; capacity: number };
export type SeatingGuestRow = { tableId: string | null; seatsAllotted: number; response: SeatReply | null | undefined };

export type SeatingStats = {
  tables: number;
  /** Seats taken, across every table. */
  seated: number;
  /** Chairs nobody is in yet, table by table — never below nought. */
  empty: number;
  byTable: Record<string, { seated: number; capacity: number }>;
};

export function seatingStats(tables: SeatingTableRow[], guests: SeatingGuestRow[]): SeatingStats {
  const byTable: SeatingStats['byTable'] = {};
  for (const t of tables) byTable[t.id] = { seated: 0, capacity: t.capacity };
  // A guest whose table is not in the list is seated nowhere the chart can
  // show, so they count for nothing rather than for a table that is not there.
  for (const g of guests) {
    if (!g.tableId || !byTable[g.tableId]) continue;
    byTable[g.tableId].seated += seatsHeld(g.seatsAllotted, g.response);
  }
  let seated = 0;
  let empty = 0;
  for (const t of Object.values(byTable)) {
    seated += t.seated;
    // A table with more people than chairs has no empty seats, not minus two.
    empty += Math.max(0, t.capacity - t.seated);
  }
  return { tables: tables.length, seated, empty, byTable };
}

/**
 * The numbered rows of one table card, seat 1 to the last chair.
 *
 * A guest takes as many rows as they are holding — a couple is two rows, the
 * first with their name and the second reading "with" them — so the card
 * shows the chairs the way the room will have them. A guest who declined
 * holds no seats but still gets one row, because a name that vanished from
 * the chart the moment they said no is a name the couple would go looking
 * for; the card strikes it through instead. Rows past the last guest are the
 * empty chairs, and a table with more people than chairs runs past its
 * capacity rather than hiding anybody.
 */
export type SeatRow<G> = { seat: number; guest: G | null; first: boolean };

export function seatRows<G extends { seatsAllotted: number; response: SeatReply | null | undefined }>(capacity: number, guests: G[]): SeatRow<G>[] {
  const rows: SeatRow<G>[] = [];
  for (const g of guests) {
    const n = Math.max(1, seatsHeld(g.seatsAllotted, g.response));
    for (let i = 0; i < n; i++) rows.push({ seat: rows.length + 1, guest: g, first: i === 0 });
  }
  while (rows.length < capacity) rows.push({ seat: rows.length + 1, guest: null, first: false });
  return rows;
}
