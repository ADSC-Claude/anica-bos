/**
 * Setting defaults, kept free of `server-only` so the seed script and CLI
 * jobs can import them too. Everything configurable has a sane default, so a
 * fresh install works before anyone has opened Settings.
 */
export const DEFAULT_SETTINGS = {
  // --- business profile ---
  'business.name': 'Invited',
  'business.tagline': 'Digital invitations for Filipino celebrations',
  'business.intro':
    'Beautiful, shareable digital invitations for weddings, debuts, christenings and birthdays — one-time payment, GCash and Maya accepted, no app needed for guests.',
  'business.email': 'hello@example.com',
  'business.phone': '+63 900 000 0000',
  'business.address': 'Quezon City, Metro Manila, Philippines',
  'business.logoUrl': '',
  'business.facebook': '',
  'business.instagram': '',
  /** Shown in the trust bar. Updated by the owner, not computed, so it can be honest and round. */
  'business.invitesCreatedLabel': '',
  'business.rsvpsCollectedLabel': '',

  // --- how customers reach a person ---
  /** m.me link or full Messenger URL. Empty hides the button. */
  'contact.messenger': 'https://m.me/yourpage',
  /** viber://chat?number=%2B639... or a viber.me link. Empty hides the button. */
  'contact.viber': 'viber://chat?number=%2B639000000000',
  'contact.whatsapp': '',
  'contact.hoursNote': 'We reply on Messenger and Viber from 9 AM to 9 PM, Manila time.',

  // --- manual payment details shown to customers who transfer directly ---
  'payments.manualEnabled': true,
  'payments.gcashName': 'Juan Dela Cruz',
  'payments.gcashNumber': '0917 000 0000',
  'payments.gcashQrUrl': '',
  'payments.mayaName': '',
  'payments.mayaNumber': '',
  'payments.bankAccounts': [
    { bank: 'BPI', name: 'Juan Dela Cruz', number: '0000 0000 00' },
    { bank: 'BDO', name: 'Juan Dela Cruz', number: '0000 0000 0000' },
    { bank: 'UnionBank', name: 'Juan Dela Cruz', number: '0000 0000 0000' },
  ] as { bank: string; name: string; number: string }[],
  'payments.manualNote': 'Send the exact amount, then upload a screenshot of the receipt. We verify manual payments within a few hours during business hours.',
  /** Unpaid orders are cancelled after this many days. */
  'orders.unpaidExpiryDays': 7,

  // --- service levels ---
  /**
   * The ordinary Done-For-You promise, as a range: seven to ten working days.
   *
   * Both ends do work. The near end is what we quote, the far end is what a
   * due date is set from, because the far end is the promise. Neither is a
   * queue: an invitation finished on the eighth day is sent on the eighth day,
   * and nobody is held to the end of an estimate because it was written down.
   */
  'dfy.turnaroundDays': 7,
  'dfy.turnaroundDaysMax': 10,
  /**
   * Priority, the queue jump Signature and Luxury are sold: two to three
   * working days. Not one — those builds carry too much to encode overnight,
   * which is the same reason rush is not offered with them at all.
   *
   * Its revision rounds are not here: a hurried build's rounds are capped by
   * tier in pricing.ts, because buying speed reduces the rounds rather than
   * setting them.
   */
  'concierge.turnaroundDays': 2,
  'concierge.turnaroundDaysMax': 3,
  /** Rush, the Basic and Standard queue jump. */
  'rush.turnaroundHours': 24,

  // --- policies shown on the site ---
  'policy.refund':
    'Because every invitation is built to order, payments are non-refundable once your invitation has been published or once our team has started building it. If we cannot deliver, you get a full refund.',
  'policy.privacy':
    'Guest lists are personal data. We collect only what an invitation needs, never share it, and delete it on request — in line with the Data Privacy Act of 2012 (RA 10173).',

  // --- messaging templates ---
  'email.orderReceived':
    'Hi {{customerName}},\n\nWe received your order {{reference}} for {{packageName}}.\n\nTotal: {{total}}\nStatus: {{status}}\n\n{{nextStep}}\n\nQuestions? Message us on Messenger: {{messenger}}\n\n— {{businessName}}',
  'email.orderActive':
    'Hi {{customerName}},\n\nYour payment for order {{reference}} is confirmed. {{nextStep}}\n\nOpen your dashboard: {{appUrl}}/account\n\n— {{businessName}}',
  'email.previewReady':
    'Hi {{customerName}},\n\nYour invitation preview is ready: {{previewUrl}}\n\nHave a look on your phone, then approve it or tell us what to change from your dashboard. You have {{revisionsLeft}} revision round(s) left.\n\n— {{businessName}}',
  'email.rsvpReceived':
    'Hi {{customerName}},\n\n{{guestName}} just responded to {{invitationTitle}}: {{response}} ({{seats}} seat(s)).\n\nSee all responses: {{appUrl}}/account/invitations/{{invitationId}}/rsvps\n\n— {{businessName}}',
  'sms.rsvpReminder':
    'Hi {{guestName}}! {{hosts}} would love to know if you can make it on {{eventDate}}. Please RSVP here: {{link}}',
  /**
   * The same reminder by e-mail, and longer on purpose: a text is charged by
   * the segment and reads on a lock screen, while an e-mail is free and read
   * in an inbox beside a hundred others. So it says who it is from in the
   * subject, and the body has room to name the day and the place.
   */
  'email.rsvpReminderSubject': 'RSVP for {{hosts}} — {{eventDate}}',
  'email.rsvpReminder':
    'Hi {{guestName}},\n\n{{hosts}} would love to know if you can make it on {{eventDate}}.\n\nYour invitation, and the RSVP, are here:\n{{link}}\n\nThe link is yours — it already knows your name and the seats set aside for you, so there is nothing to look up.\n\nSee you soon!\n{{hosts}}',
  /**
   * What a guest gets back for replying: proof they did, and the link again.
   *
   * It is written to be read once and then found in a search months later,
   * which is why the subject carries the hosts and the day rather than the
   * word "confirmation" — nobody searches their inbox for that.
   */
  'email.rsvpConfirmationSubject': 'Your RSVP for {{hosts}} — {{eventDate}}',
  'email.rsvpConfirmation':
    'Hi {{guestName}},\n\nThank you — we have you down as {{response}}{{seatsLine}}.\n\n{{hosts}} · {{eventDate}}\n\nIf anything changes, you can update your reply on the same link:\n{{link}}\n\nSee you soon!\n{{hosts}}',
  /** Semaphore sender ID. Blank uses the account default. */
  'sms.senderName': '',

  // --- the public site ---
  'site.comingSoon': false,
  'site.demoSlug': 'juan-and-maria',
  'site.defaultLanguage': 'en',
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = { -readonly [K in SettingKey]: (typeof DEFAULT_SETTINGS)[K] };
