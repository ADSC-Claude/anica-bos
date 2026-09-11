/**
 * The add-ons this codebase keeps an opinion about: what each one costs, what
 * it is called, what the customer is told it does, and whether it is for sale
 * yet.
 *
 * One list, read by `npm run db:pricing` (which reconciles the rows an
 * existing database already has) and by the seed (which creates them on an
 * empty one). They used to be two lists in two files, which is how
 * SAVE_THE_DATE came to be ₱299 in the seed and ₱500 in the price list at the
 * same time.
 *
 * Rows the catalogue has no opinion about — PREMIUM_OPENING, CUSTOM_DOMAIN —
 * are deliberately absent from ADDONS: their prices are the admin's, and a
 * pricing run should not quietly put them back to whatever was typed here. The
 * second appears in SHELVED_ADDONS below, which takes a row off the website
 * without touching what it costs.
 */

/**
 * Withdrawn, and deactivated rather than deleted so an order that bought one
 * keeps its line item.
 *
 * Each carries its own reason, because they were withdrawn for different ones
 * and the run that withdraws them says so out loud — in the log an operator
 * reads, and in the audit entry that is the only lasting record of why a row
 * customers could buy last week is gone this week. A single hardcoded sentence
 * stood here before and told everybody the SMS pack went because "the design
 * is settled at publish", which is true of the template switch and nonsense
 * about a credit pack.
 */
export const RETIRED_ADDONS: { code: string; reason: string }[] = [
  { code: 'TEMPLATE_SWITCH', reason: 'the design is settled at publish' },
  { code: 'SMS_PACK', reason: 'the reminder bands replaced it' },
];

/**
 * Taken off the website, kept in the system, and expected back.
 *
 * The same single operation as retiring — `active: false`, so the landing page
 * and the checkout stop offering it while the row, its price and any order that
 * bought one all stay exactly as they are — but not the same decision, which is
 * why it is not the same list. A retired add-on is one we have stopped selling.
 * This one is an add-on we should not have been selling yet: a customer could
 * pay ₱999 to have a domain set up, and nobody here is set up to do it.
 *
 * The printable sat beside it and has come back, at ₱199 and with a description
 * that says what actually happens — see ADDONS. The difference is not that the
 * layout got built: it is that arranging pages by hand is work this business
 * already does, and a domain is not.
 *
 * Their prices are untouched on purpose. The catalogue has no opinion about
 * what these cost — see the note at the top — and hiding a row is not a reason
 * to start overruling the admin about its price. Putting one back on sale is
 * ticking `active` in admin, or deleting a line here.
 */
export const SHELVED_ADDONS: { code: string; reason: string }[] = [
  { code: 'CUSTOM_DOMAIN', reason: 'no one is set up to do the domain yet' },
];

/**
 * The rows only the seed creates, and whose prices are the admin's.
 *
 * They live here rather than inline in prisma/seed.ts for one reason: the seed
 * writes every add-on in a single createMany, so a code that appears in both
 * lists violates AddOn_code_key and takes the whole seed down. That is exactly
 * what happened when the printable came back — it was in the seed at ₱299 and
 * in ADDONS at ₱199 at the same time, and CI went red on a database error that
 * no amount of typechecking could have caught.
 *
 * With both lists in one file a test can hold them apart, which is the test
 * directly below this file's own name in tests/addons.test.ts.
 *
 * Nothing here is repriced by a pricing run: set-pricing reads ADDONS only, so
 * these keep whatever the admin last typed.
 */
export type SeedOnlyAddOn = {
  code: string;
  name: string;
  description: string;
  priceCents: number;
  sortOrder: number;
  active?: boolean;
  quoted?: boolean;
};

export const SEED_ONLY_ADDONS: SeedOnlyAddOn[] = [
  // The premium opening video, at the starting price: every package opens with
  // the included opening; this is the designed clip made for a design.
  { code: 'PREMIUM_OPENING', name: 'Premium opening', description: 'Our premium designed opening video for your design — a seal breaks, the card slides out with your names and date on it. Starting price.', priceCents: 99_900, sortOrder: 1 },
  // Off the website, priced and kept — see SHELVED_ADDONS. Seeded inactive so a
  // fresh database matches a live one rather than briefly offering something
  // nothing behind the scenes can deliver.
  { code: 'CUSTOM_DOMAIN', name: 'Custom domain setup', description: 'Your own domain (excludes domain cost).', priceCents: 99_900, active: false, sortOrder: 6 },
  // Withdrawn, and seeded withdrawn so a fresh database matches a live one: an
  // order that bought either keeps its line item either way.
  { code: 'TEMPLATE_SWITCH', name: 'Extra template switch', description: 'Change design after publishing. Withdrawn: the design is settled at publish.', priceCents: 19_900, active: false, sortOrder: 4 },
  { code: 'SMS_PACK', name: 'SMS reminder blast (credit pack)', description: 'RSVP reminders by text. Priced per pack — ask us.', priceCents: 0, quoted: false, active: false, sortOrder: 7 },
];

export type AddOnSpec = {
  code: string;
  price: number;
  name: string;
  description: string;
  sortOrder: number;
  /**
   * A picture of what it buys. Most of these are a thing that happens rather
   * than a thing you hold — a desk at the door, a name appearing on a guest's
   * own invitation — and a sentence asks the customer to imagine it. Blank is
   * allowed and renders nothing; it is not a broken frame.
   */
  image?: string;
  /**
   * Priced and catalogued, but not shown or sold: the row exists so the price
   * is settled and editable in admin, and `active: false` keeps it off the
   * landing page and out of the checkout. Selling it is one tick away once
   * what it promises can actually be delivered.
   */
  held?: true;
};

/**
 * The queue jumps, in pesos. Rush is Basic's and Standard's and promises 24
 * hours; priority is Signature's and Luxury's and promises two to three working
 * days, because those builds carry per-guest links, seating and a programme,
 * which is more than one night of work. addOnAvailable in src/lib/pricing.ts
 * decides which package is offered which; addOnPrice charges rush 1,500 on
 * Standard, which is the one price not held on its own row.
 *
 * Both quote the ordinary turnaround to say what they are shortening, so they
 * have to move when it does — it is seven to ten working days now, not five to
 * a week.
 */
export const ADDONS: AddOnSpec[] = [
  {
    code: 'RUSH',
    price: 1_000,
    name: 'Rush publish (24 hours)',
    description: 'Your invitation jumps the queue and is published within 24 hours instead of the usual seven to ten working days. Fewer revision rounds come with it: there is limited time to encode, so there is minimal chance to revise. Basic and Standard — a bigger build carries too much to finish overnight, and those are sold priority instead.',
    sortOrder: 5,
  },
  {
    code: 'PRIORITY',
    price: 2_000,
    name: 'Priority (2 to 3 working days)',
    description: 'Your invitation is finished in two to three working days instead of the usual seven to ten. Fewer revision rounds come with it: there is limited time to encode, so there is minimal chance to revise. Signature and Luxury — those builds carry per-guest links, seating and a programme, which is more than one night of work however much anyone wants it tomorrow.',
    sortOrder: 6,
  },
  {
    code: 'SAVE_THE_DATE',
    price: 500,
    image: '/demo/addon-save-the-date.png',
    name: 'Save the Date card',
    description: 'A second card on the same design, with its own link, for sending months ahead. Your names, your date and your cover photo — the venue, the programme and the RSVP wait for the invitation itself. It publishes on its own, so announcing early does not use up the rounds of changes on your invitation.',
    sortOrder: 2,
  },

  /*
   * The printable, back on sale at ₱199.
   *
   * It was shelved because the Print / PDF button produces the live page on A4
   * — seventeen sheets on a real wedding, three of them a form, an upload box
   * and a countdown — and nothing produced a layout fit for paper.
   *
   * What changed is the promise, not the layout. This is not sold as a button
   * that makes a file; it is sold as a thing we arrange and send, which is what
   * this whole business already is. That is deliverable the day it goes on sale
   * and it stays true afterwards: when the A5 card is built, the same sentence
   * describes a faster version of the same deliverable.
   *
   * The description therefore promises a PDF by hand within a day, and does not
   * mention a download. Whoever builds the card should leave the promise alone
   * and simply stop doing the arranging by hand.
   */
  {
    code: 'PRINTABLE',
    price: 199,
    name: 'Printable PDF',
    description: 'A print version of your invitation, laid out for paper and sent to you as a PDF — for the copy on the reception desk, the one taped inside the church door, and the lola who is not scanning anything. We arrange it once your invitation is published and send it to you within a working day.',
    sortOrder: 3,
  },

  // Three whole features, each already built and already included in some
  // package, sold on their own to the packages below that one. Check-in and the
  // seating chart are Luxury's; the password is Signature's. addOnAvailable
  // reads that from the feature rather than from a list of tiers here, so a
  // package that is given one stops being offered it on its own.
  //
  // The first two carry the guest list and per-guest links with them, because
  // neither works without one: check-in scans a guest's token and a seating
  // chart puts a name at a table. See ADDON_FEATURE in src/lib/tiers.ts.
  {
    code: 'QR_CHECKIN',
    price: 1_000,
    image: '/demo/addon-checkin.png',
    name: 'QR check-in on the day',
    description: 'Scan your guests in at the door from your phone. Every guest gets a personal link with their own code; a tap or a scan marks them arrived, and you watch the count fill up live. Comes with the guest list, so you have somebody to scan. Included in Luxury.',
    sortOrder: 7,
  },
  {
    code: 'SEATING_VIEWER',
    price: 1_000,
    image: '/demo/addon-seating.png',
    name: 'Seating chart',
    description: 'Set your tables, put your guests at them, and each guest sees their own table name on their invitation — no seat plan by the door, no queue. Comes with the guest list, so you have somebody to seat. Included in Luxury.',
    sortOrder: 8,
  },
  {
    code: 'PHOTO_SHARING',
    price: 1_000,
    image: '/demo/addon-album.png',
    name: 'Shared album after the day',
    description: 'Your guests add their photos to your invitation from their phones, and everyone sees the day through everybody else\u2019s eyes. You approve each one before it appears. Included in Luxury.',
    sortOrder: 10,
  },
  {
    code: 'PASSWORD',
    price: 300,
    image: '/demo/addon-password.png',
    name: 'Password on your link',
    description: 'Your invitation asks for a password before it opens, so a link that gets forwarded does not let a stranger in. You choose the word and share it with your guests. Included in Signature.',
    sortOrder: 9,
  },

  ...campaigns(),
];

/**
 * The reminder campaigns, one row per guest band.
 *
 * Every one of them is `held`: priced, catalogued and not for sale. What they
 * promise is a message that goes out on a schedule — seven days before, the
 * day before, the morning of, a thank-you after — and there is no scheduler.
 * What exists today is a reminder the couple sends by hand from the guest list
 * page, to guests who have not replied. Nothing sends itself, and nothing
 * counts a guest at checkout to hold a band to its number.
 *
 * So the prices are recorded and the rows are not sold. Anybody quoting one by
 * hand can read the price off the admin table; nobody can buy undeliverable
 * work from the website. Activating them is a tick per row once the scheduler
 * and a guest count at checkout exist.
 */
export function campaigns(): AddOnSpec[] {
  const bands = [100, 250, 500, 1_000];
  const messages = 'a seven-day reminder, the day before, the morning of, or a thank-you afterwards';

  /** Text-only reminders: one of the four messages, to a band of guests. */
  const reminders = [599, 999, 1_499, 2_499];

  /** Text and e-mail together, by how many of the four messages are sent. */
  const suites: { key: string; label: string; pick: string; prices: number[] }[] = [
    { key: 'BASIC', label: 'Basic', pick: 'one message', prices: [799, 1_299, 1_999, 3_299] },
    { key: 'STANDARD', label: 'Standard', pick: 'two messages', prices: [1_399, 2_299, 3_499, 5_499] },
    { key: 'DELUXE', label: 'Deluxe', pick: 'three messages', prices: [1_999, 3_299, 4_999, 7_999] },
    { key: 'EXCLUSIVE', label: 'Exclusive', pick: 'all four messages', prices: [2_499, 4_299, 6_999, 10_999] },
  ];

  const upTo = (n: number) => `up to ${n.toLocaleString('en-PH')} guests`;
  const rows: AddOnSpec[] = [];

  bands.forEach((band, i) => {
    rows.push({
      code: `SMS_REMINDER_${band}`,
      price: reminders[i],
      name: `Event reminders by text — ${upTo(band)}`,
      description: `One reminder by text to ${upTo(band)}: ${messages}. Pick the one you want when you book.`,
      sortOrder: 20 + i,
      held: true,
    });
  });

  suites.forEach((suite, s) => {
    bands.forEach((band, i) => {
      rows.push({
        code: `COMMS_${suite.key}_${band}`,
        price: suite.prices[i],
        name: `Guest communication ${suite.label} — ${upTo(band)}`,
        description: `${suite.pick[0].toUpperCase()}${suite.pick.slice(1)} by text and e-mail to ${upTo(band)}, from ${messages}.`,
        sortOrder: 30 + s * 10 + i,
        held: true,
      });
    });
  });

  return rows;
}

