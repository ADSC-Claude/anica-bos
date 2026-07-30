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
  'booking.bankDetails': 'BDO • ANICA Wellness Spa • 0000 0000 0000',
  'booking.depositOnCancel': 'FORFEIT' as 'FORFEIT' | 'REFUND',
  'booking.leadTimeMinutes': 60,
  'booking.slotStepMinutes': 30,

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
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = { [K in SettingKey]: (typeof DEFAULT_SETTINGS)[K] };
