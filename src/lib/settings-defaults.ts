/**
 * Setting defaults, kept free of `server-only` so the seed script and CLI
 * jobs can import them too.
 */
export const DEFAULT_SETTINGS = {
  // --- business profile ---
  'business.name': 'ANICA Wellness Spa',
  'business.tagline': 'Rest. Restore. Renew.',
  'business.address': 'Quezon City, Metro Manila, Philippines',
  'business.contact': '+63 900 000 0000',
  'business.email': 'hello@anicawellnessspa.ph',
  'business.facebook': 'https://www.facebook.com/ANICAWellnessSpa',
  'business.mapEmbedUrl': '',
  'business.logoUrl': '',
  /// Photo behind the hero arch. Either a file uploaded to /public ("/hero.jpg")
  /// or a full https:// URL. Empty shows the placeholder.
  'business.heroImageUrl': '',
  'business.tin': '000-000-000-00000',
  'business.currency': 'PHP',
  'business.timezone': 'Asia/Manila',
  'business.openMinute': 720, // 12:00 NN
  'business.closeMinute': 1440, // 12:00 MN
  'business.receiptFooter': 'Thank you for visiting ANICA Wellness Spa!',

  // --- tax / BIR ---
  'tax.regime': 'NON_VAT_8' as 'NON_VAT_8' | 'VAT_REGISTERED',
  'tax.vatPercent': 12,
  'tax.nonVatNotice':
    'THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX. Non-VAT registered taxpayer.',
  'tax.vatThresholdCents': 300_000_000, // ₱3,000,000 VAT registration threshold
  'tax.casAccredited': false,

  // --- online booking ---
  'booking.enabled': true,
  'booking.depositPercent': 30,
  'booking.expiryMinutes': 120,
  'booking.manualFallbackEnabled': false,
  'booking.gcashName': 'ANICA Wellness Spa',
  'booking.gcashNumber': '0900 000 0000',
  /** One account per line — see lib/transfer-accounts.ts. */
  'booking.bankDetails': 'BDO • ANICA Wellness Spa • 0000 0000 0000',
  /**
   * How a reservation fee is treated when the guest cancels *in time* — that
   * is, at least `booking.cancellationHours` before her appointment.
   *
   * A late cancellation and a no-show always forfeit, whatever this says: the
   * bed was held and the hour could no longer be resold.
   */
  'booking.depositOnCancel': 'REFUND' as 'FORFEIT' | 'REFUND',
  /**
   * How many hours before her appointment a guest must cancel to keep her
   * reservation fee.
   *
   * The number is not about the guest, it is about the floor: it is how much
   * notice the spa needs to sell the hour to somebody else on the same day. Set
   * it to the point where a freed slot can still realistically be filled.
   */
  'booking.cancellationHours': 5,
  'booking.leadTimeMinutes': 60,
  'booking.slotStepMinutes': 15,
  /**
   * How long before closing a booking may still be *requested*.
   *
   * A treatment that finishes by closing is sold outright. Between this cut-off
   * and closing, a longer treatment can still be asked for — it books as a
   * request the receptionist approves or declines, since it means someone stays
   * late. 0 turns requests off and the spa simply closes on time.
   */
  'booking.lastCallMinutes': 60,
  /**
   * Minutes left free between two treatments in the same visit.
   *
   * A guest coming out of the sauna showers, is consulted, has her feet soaked
   * and waits for the therapist to set up. Booking the massage the instant the
   * sauna ends quotes a finish time the spa cannot hit.
   *
   * Five minutes, deliberately short. It is a changeover, not a buffer for
   * every delay: a sauna at 1:30 then an hour's massage runs 1:30–2:00 and
   * 2:05–3:05, which puts the next bookable slot at 3:15 on the quarter-hour
   * grid. That ten minutes of slack is where a slow consultation goes. Padding
   * the gap instead would price a whole extra treatment out of the evening.
   * A treatment that genuinely needs longer can override this in
   * Settings → Services.
   */
  'booking.changeoverMinutes': 5,

  // --- POS ---
  'pos.discountApprovalPercent': 20,
  'pos.tipsEnabled': true,
  'pos.pettyCashMinimumCents': 100_000, // ₱1,000 — below this, ask to replenish
  'pos.pettyCashFloatCents': 300_000, // ₱3,000 opening float

  // --- loyalty & membership ---
  'loyalty.enabled': true,
  'loyalty.pesosPerPoint': 100, // ₱100 spent = 1 point
  'loyalty.pointValueCents': 100, // 1 point = ₱1 off
  'membership.validityDays': 365,
  'membership.birthdayPerkEnabled': true,
  'membership.birthdayPerkServiceName': 'ANICA Signature Massage',
  'membership.expiryAlertDays': 30,

  // --- payroll ---
  'payroll.periodType': 'SEMI_MONTHLY' as 'WEEKLY' | 'SEMI_MONTHLY',
  'payroll.dailyAllowanceCents': 20_000, // ₱200/day for therapists
  'payroll.commissionPercent': 25, // 25% of undiscounted service price
  'payroll.lateDeductionType': 'FIXED' as 'FIXED' | 'PERCENT',
  'payroll.lateDeductionValue': 5_000, // ₱50 per late
  'payroll.lateGraceMinutes': 15,
  'payroll.absenceDeductionType': 'PERCENT' as 'FIXED' | 'PERCENT',
  'payroll.absenceDeductionValue': 100, // 100% of the daily allowance
  'payroll.regularHolidayMultiplier': 200, // 2.00x, in whole percent
  'payroll.specialHolidayMultiplier': 130, // 1.30x

  // --- operations ---
  'rotation.rule': 'TIME_IN_ROUND_ROBIN' as 'TIME_IN_ROUND_ROBIN' | 'LEAST_BOOKED',
  'retention.defaultThresholdDays': 60,
  'inventory.autoDeductRecipes': true,

  // --- comms ---
  'email.enabled': true,
  'email.senderName': 'ANICA Wellness Spa',
  'email.birthdayGreetingEnabled': true,
  'sms.enabled': false,
  'permits.reminderLeadDays': [60, 30],

  // --- privacy ---
  //
  // How long the two logs that are *not* business records are kept. Both hold
  // personal information the spa has no lasting reason to keep: sign-in
  // attempts carry an IP address, and the email log carries a client address
  // beside what was sent to it. The Data Privacy Act asks that personal data be
  // held no longer than the purpose needs — the purpose here is investigating a
  // recent break-in or a bounced email, and neither purpose is served by a
  // record from four years ago.
  //
  // Set either to 0 to keep it forever. The audit log is deliberately absent
  // and cannot be pruned at all: it is append-only, it is what an examiner
  // reads, and BIR wants ten years of it.
  'privacy.loginLogRetentionDays': 365,
  'privacy.emailLogRetentionDays': 730,
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = { [K in SettingKey]: (typeof DEFAULT_SETTINGS)[K] };
