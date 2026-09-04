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
  'dfy.turnaroundDays': 3,
  'dfy.revisions': 2,
  'concierge.turnaroundDays': 5,
  'concierge.revisions': 3,
  'rush.turnaroundHours': 24,

  // --- policies shown on the site ---
  'policy.refund':
    'Because every invitation is built to order, payments are non-refundable once your invitation has been published or your Done-For-You build has started. If we cannot deliver, you get a full refund.',
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
  /** Semaphore sender ID. Blank uses the account default. */
  'sms.senderName': '',

  // --- the public site ---
  'site.comingSoon': false,
  'site.demoSlug': 'juan-and-maria',
  'site.defaultLanguage': 'en',
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = { -readonly [K in SettingKey]: (typeof DEFAULT_SETTINGS)[K] };
