/**
 * Everything a person can change without a deploy. The shape here is the type
 * — `getSettings()` returns exactly this, with stored values layered over the
 * defaults, so a key added in code works before anyone opens Settings.
 */
export const SETTINGS_DEFAULTS = {
  // --- the business -------------------------------------------------------
  'business.name': 'ANICA Stays',
  'business.tagline': 'Stay somewhere that feels like yours.',
  'business.intro':
    'Thoughtfully kept condos in Metro Manila and a quiet family house in Bulacan. Booked direct, so the best rate is the one you see.',
  'business.email': 'stay@example.com',
  'business.phone': '+63 917 000 0000',
  'business.address': 'Metro Manila, Philippines',
  'business.facebook': '',
  'business.instagram': '',
  'business.heroImage': '/images/hero.svg',

  // --- booking rules ------------------------------------------------------
  /** Percent of the total taken up front. 100 means full payment. */
  'booking.depositPercent': 30,
  /** How long an unpaid booking holds its dates before the cron releases them. */
  'booking.holdMinutes': 30,
  /** Balance-due email goes this many days before check-in. */
  'booking.balanceDueDays': 7,
  'booking.minLeadHours': 4,
  'booking.maxAdvanceDays': 365,
  'booking.cancellationPolicy':
    'Free cancellation up to 7 days before check-in — your deposit is returned in full. Within 7 days the deposit is non-refundable. No refund for no-shows.',
  'booking.termsNote':
    'We collect your name, email and mobile only to manage your stay and to meet our legal record-keeping duties. Marketing is opt-in and one click to leave.',

  // --- guest tiers --------------------------------------------------------
  'guest.repeatAfterStays': 2,
  'guest.vipAfterStays': 4,
  'guest.vipAfterSpendCents': 15000000, // ₱150,000
  'guest.lapsedAfterDays': 240,

  // --- email --------------------------------------------------------------
  'email.enabled': true,
  'email.replyTo': '',

  // --- operations ---------------------------------------------------------
  /** Hours before a cleaning deadline at which a task turns URGENT. */
  'ops.urgentWithinHours': 4,
  /** When no next check-in exists, a clean is due this many hours after checkout. */
  'ops.defaultCleaningHours': 24,
  'ops.alertUnreadyWithinHours': 6,

  // --- targets, for the dashboard bars ------------------------------------
  'kpi.monthlyRevenueTargetCents': 28000000, // ₱280,000
  'kpi.occupancyTargetPercent': 70,
  'kpi.adrTargetCents': 400000, // ₱4,000

  // --- documents ----------------------------------------------------------
  /** Reminder lead times in days; after the smallest, it repeats weekly. */
  'documents.reminderLeadDays': [60, 30],

  // --- sync ---------------------------------------------------------------
  'sync.icalEnabled': true,
  'sync.pollMinutes': 15,
} as const;

export type SettingsShape = {
  -readonly [K in keyof typeof SETTINGS_DEFAULTS]: (typeof SETTINGS_DEFAULTS)[K];
};

export type SettingKey = keyof SettingsShape;

/** Grouped for the Settings screens. */
export const SETTINGS_GROUPS: { title: string; description: string; keys: SettingKey[] }[] = [
  {
    title: 'The business',
    description: 'Name, contact details and the copy that appears on the public site.',
    keys: [
      'business.name',
      'business.tagline',
      'business.intro',
      'business.email',
      'business.phone',
      'business.address',
      'business.facebook',
      'business.instagram',
      'business.heroImage',
    ],
  },
  {
    title: 'Booking rules',
    description:
      'How much is taken up front, how long unpaid dates are held, and the policy a guest agrees to.',
    keys: [
      'booking.depositPercent',
      'booking.holdMinutes',
      'booking.balanceDueDays',
      'booking.minLeadHours',
      'booking.maxAdvanceDays',
      'booking.cancellationPolicy',
      'booking.termsNote',
    ],
  },
  {
    title: 'Guests',
    description: 'When someone counts as a repeat guest, and when they count as VIP.',
    keys: [
      'guest.repeatAfterStays',
      'guest.vipAfterStays',
      'guest.vipAfterSpendCents',
      'guest.lapsedAfterDays',
    ],
  },
  {
    title: 'Operations',
    description: 'Turnover deadlines and when a unit that is not ready becomes an alarm.',
    keys: ['ops.urgentWithinHours', 'ops.defaultCleaningHours', 'ops.alertUnreadyWithinHours'],
  },
  {
    title: 'Targets',
    description: 'The bars on the dashboard measure against these.',
    keys: [
      'kpi.monthlyRevenueTargetCents',
      'kpi.occupancyTargetPercent',
      'kpi.adrTargetCents',
    ],
  },
  {
    title: 'Email and sync',
    description: 'Whether mail goes out, and how often Airbnb calendars are polled.',
    keys: ['email.enabled', 'email.replyTo', 'sync.icalEnabled', 'sync.pollMinutes'],
  },
];

export const SETTING_LABELS: Partial<Record<SettingKey, string>> = {
  'business.name': 'Business name',
  'business.tagline': 'Tagline (hero)',
  'business.intro': 'Intro paragraph',
  'business.email': 'Contact email',
  'business.phone': 'Contact number',
  'business.address': 'Address shown publicly',
  'business.facebook': 'Facebook URL',
  'business.instagram': 'Instagram URL',
  'business.heroImage': 'Hero image path',
  'booking.depositPercent': 'Deposit taken at booking (%)',
  'booking.holdMinutes': 'Hold unpaid dates for (minutes)',
  'booking.balanceDueDays': 'Balance reminder, days before check-in',
  'booking.minLeadHours': 'Minimum notice before check-in (hours)',
  'booking.maxAdvanceDays': 'How far ahead guests may book (days)',
  'booking.cancellationPolicy': 'Cancellation policy',
  'booking.termsNote': 'Privacy note on the booking form',
  'guest.repeatAfterStays': 'Repeat guest after N stays',
  'guest.vipAfterStays': 'VIP after N stays',
  'guest.vipAfterSpendCents': 'VIP after total spend (centavos)',
  'guest.lapsedAfterDays': 'Treat a guest as lapsed after (days)',
  'email.enabled': 'Send email',
  'email.replyTo': 'Reply-to address',
  'ops.urgentWithinHours': 'Cleaning turns urgent within (hours)',
  'ops.defaultCleaningHours': 'Cleaning due within (hours) when nobody is arriving',
  'ops.alertUnreadyWithinHours': 'Warn about an unready unit within (hours) of arrival',
  'kpi.monthlyRevenueTargetCents': 'Monthly revenue target (centavos)',
  'kpi.occupancyTargetPercent': 'Occupancy target (%)',
  'kpi.adrTargetCents': 'ADR target (centavos)',
  'sync.icalEnabled': 'Poll Airbnb calendars',
  'sync.pollMinutes': 'Poll every (minutes)',
};
