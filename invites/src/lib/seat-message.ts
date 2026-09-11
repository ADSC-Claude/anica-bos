/**
 * The words a couple starts from when they have to cut somebody's party down.
 *
 * A draft, never a send. The approval sends itself — a receipt for the number
 * somebody asked for surprises nobody — but the cut is a message about a
 * relationship, and the couple is the only one who knows whether this is the
 * tita who will laugh it off or the ninong who will not. So the system writes
 * a first version and gets out of the way.
 *
 * Deliberately free of `server-only` and of Prisma: the drawer that shows the
 * draft is a client component, and the same words go into the e-mail the server
 * sends. Two copies would drift, and the copy that drifts is always the one
 * actually delivered.
 */

export type SeatNote = { subject: string; body: string };

export type SeatNoteInput = {
  /** What to call them — their salutation if the couple set one. */
  guestName: string;
  /** The couple, as their invitation names them. */
  hosts: string;
  /** What the guest put down. */
  claimed: number;
  /** What the couple settled on. */
  approved: number;
  /** Their own link back to the invitation. */
  link: string;
};

const seats = (n: number) => `${n} seat${n === 1 ? '' : 's'}`;

/**
 * Why it is worded like this.
 *
 * It thanks them before it asks anything of them, because the first line is the
 * one that decides how the rest is read. It blames the venue rather than the
 * guest, which is both kinder and usually true — the number came off a dropdown
 * nobody had told them about. It never uses the words "approved", "rejected" or
 * "your request", which are the words of a form and not of a family. And it
 * ends with the invitation link, so the last thing in the message is still an
 * invitation.
 *
 * Nobody is told they are not coming. A party of six becomes a party of two and
 * the two still come; that is what a cut means here, and the wording says so.
 */
export function trimNote({ guestName, hosts, claimed, approved, link }: SeatNoteInput): SeatNote {
  const subject = `About your seats for ${hosts}`;
  const body = [
    `Hi ${guestName},`,
    '',
    `Thank you for saying yes — we are so happy you can be with us.`,
    '',
    approved === 0
      ? `We have run out of room at the venue and we are not able to keep a place for your group after all. We are so sorry, and we hope you understand.`
      : `The venue has us keeping to a strict headcount, so we are only able to hold ${seats(approved)} for you rather than the ${claimed} on your reply. We are sorry to have to ask, and we hope you understand.`,
    '',
    `Everything about the day is still here if you need it: ${link}`,
    '',
    'See you soon,',
    hosts,
  ].join('\n');
  return { subject, body };
}

/**
 * The same note as one line, for pasting into a chat.
 *
 * Viber, WhatsApp and a phone's own Messages app all take a body of text in a
 * link, and that is how most of these will actually be sent — the couple is
 * already in the group chat with this person. The subject goes away, because a
 * chat has no subject, and the blank lines close up, because a message that
 * arrives as six bubbles reads as six messages.
 */
export function asChatText(note: SeatNote): string {
  return note.body.replace(/\n{2,}/g, '\n\n').trim();
}

/**
 * The deep links that open the couple's own app with the message already in it.
 *
 * Messenger is missing on purpose rather than by oversight: its send dialog
 * forwards a link and has no field for a body, so a message pasted into that
 * URL simply disappears. The drawer offers a copy button for that case instead
 * of a button that looks like the others and quietly loses the words.
 */
export function chatLinks(text: string): { label: string; href: string }[] {
  const encoded = encodeURIComponent(text);
  return [
    { label: 'Viber', href: `viber://forward?text=${encoded}` },
    { label: 'WhatsApp', href: `https://wa.me/?text=${encoded}` },
    { label: 'Messages', href: `sms:?&body=${encoded}` },
  ];
}
