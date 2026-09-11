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
 * Rows the catalogue has no opinion about — PREMIUM_OPENING, PRINTABLE,
 * CUSTOM_DOMAIN — are deliberately absent: their prices are the admin's, and a
 * pricing run should not quietly put them back to whatever was typed here.
 */

/**
 * Withdrawn, and deactivated rather than deleted so an order that bought one
 * keeps its line item.
 *
 * Nothing about a published invitation is the customer's to switch, so the
 * template-switch add-on has nothing to sell. The SMS credit pack went when
 * the reminder campaigns below replaced it: it was one "ask us" row standing
 * in for a service with no shape, and the bands give it one.
 */
export const RETIRED_ADDONS = ['TEMPLATE_SWITCH', 'SMS_PACK'];

export type AddOnSpec = {
  code: string;
  price: number;
  name: string;
  description: string;
  sortOrder: number;
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
 * hours; priority is Signature's and promises two working days, because that
 * build carries too much to encode overnight. addOnAvailable in
 * src/lib/pricing.ts decides which tier is offered which; addOnPrice charges
 * rush 1,500 on Standard, which is the one price not held on its own row.
 */
export const ADDONS: AddOnSpec[] = [
  {
    code: 'RUSH',
    price: 1_000,
    name: 'Rush publish (24 hours)',
    description: 'Your invitation jumps the queue and is published within 24 hours instead of the usual five days to a week. Fewer revision rounds come with it: there is limited time to encode, so there is minimal chance to revise. Basic and Standard.',
    sortOrder: 5,
  },
  {
    code: 'PRIORITY',
    price: 2_000,
    name: 'Priority (2 working days)',
    description: 'Your invitation is finished in two working days instead of the usual five to a week. Fewer revision rounds come with it: there is limited time to encode, so there is minimal chance to revise. Signature only.',
    sortOrder: 6,
  },
  {
    code: 'SAVE_THE_DATE',
    price: 500,
    name: 'Save the Date card',
    description: 'A second card on the same design, with its own link, for sending months ahead. Your names, your date and your cover photo — the venue, the programme and the RSVP wait for the invitation itself. It publishes on its own, so announcing early does not use up the rounds of changes on your invitation.',
    sortOrder: 2,
  },

  // The three features Signature includes and the packages below it may buy on
  // their own. Each is a whole feature, already built and already sold, and
  // addOnAvailable declines to offer one to Signature, which has it already.
  //
  // The first two carry the guest list and per-guest links with them, because
  // neither works without one: check-in scans a guest's token and a seating
  // chart puts a name at a table. See ADDON_FEATURE in src/lib/tiers.ts.
  {
    code: 'QR_CHECKIN',
    price: 1_000,
    name: 'QR check-in on the day',
    description: 'Scan your guests in at the door from your phone. Every guest gets a personal link with their own code; a tap or a scan marks them arrived, and you watch the count fill up live. Comes with the guest list, so you have somebody to scan. Included in Signature.',
    sortOrder: 7,
  },
  {
    code: 'SEATING_VIEWER',
    price: 1_000,
    name: 'Seating chart',
    description: 'Set your tables, put your guests at them, and each guest sees their own table name on their invitation — no seat plan by the door, no queue. Comes with the guest list, so you have somebody to seat. Included in Signature.',
    sortOrder: 8,
  },
  {
    code: 'PASSWORD',
    price: 300,
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

