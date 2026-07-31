/**
 * Who a booking is actually for.
 *
 * The person who books a party stays the client of record — they pay, they earn
 * the loyalty, they are who the spa can call — so every row in a party carries
 * the same `clientId`. Without this, a day sheet for a party of four reads
 * "Maria Santos" four times, and the therapist walking to Bed 3 has no idea who
 * is on it.
 */
export function bookingFor(appt: {
  guestName: string;
  client: { name: string };
}): string {
  return appt.guestName || appt.client.name;
}

/**
 * The same, with the booker named when the guest is not the booker.
 *
 * For the desk rather than the therapist: "Nina R. (with Maria Santos)" is what
 * lets reception find the party when only one of them is standing there.
 */
export function bookingForWithBooker(appt: {
  guestName: string;
  partyRef: string;
  client: { name: string };
}): string {
  if (!appt.guestName) return appt.client.name;
  return `${appt.guestName} · with ${appt.client.name}`;
}
