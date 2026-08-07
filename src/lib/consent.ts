/**
 * The words a client agrees to before a treatment, kept in one place.
 *
 * Two consents, not one. The Data Privacy Act wants consent that is specific
 * to a purpose, and a liability waiver is a different purpose from holding
 * someone's health history — bundle them into a single tick and neither is
 * clean. They are also collected differently: privacy consent is given once
 * and stands, the waiver is what the client signs against the treatment they
 * are about to receive. So each gets its own box and its own timestamp on the
 * client record.
 *
 * Copy lives here rather than in the forms because the same sentence appears on
 * the public booking wizard and behind the desk, and consent text that has
 * drifted between two screens is consent the spa cannot stand behind.
 */

// ------------------------------------------------------------ what the client reads

/**
 * RA 10173 consent for holding personal and health information.
 *
 * An earlier version of this promised health details were "never exported",
 * which the system does not honour: the Owner's full backup contains them, by
 * design, because a spa that cannot restore its own records has no records.
 * Consent that describes something the software does not do is worse than no
 * consent at all — the client agreed to a system that does not exist. So the
 * sentence now says what actually happens, including the part that is less
 * comfortable to write down.
 */
export const PRIVACY_CONSENT =
  'I consent to ANICA Wellness Spa collecting and storing my personal and health ' +
  'information for my treatment, safety and booking records, in line with the ' +
  'Philippine Data Privacy Act of 2012 (RA 10173). My health details are seen ' +
  'only by spa staff caring for me, are never sold or given to anyone outside ' +
  'the spa, and leave the spa only inside the encrypted backup the owner keeps. ' +
  'Every time a staff member opens my health record it is logged. I may ask to see, ' +
  'correct or erase my personal information at any time — my paid receipts are ' +
  'kept for ten years, as the BIR requires, but my health answers and contact ' +
  'details are erased on request.';

/** The sentence the waiver clauses hang off. */
export const WAIVER_LEAD =
  'I have read, understood and completed this form to the best of my knowledge, ' +
  'and I consent to receive spa services:';

/**
 * Three clauses, not the six a paper waiver usually runs to — "I accept
 * responsibility" and "I certify I have read this" each said it twice, and a
 * clause nobody finishes reading protects nobody.
 */
export const WAIVER_CLAUSES = [
  'My answers above are true and complete. I understand that leaving out health ' +
    'information can lead to adverse effects from a treatment, and I take ' +
    'responsibility for anything I did not disclose.',
  'The services and their possible side effects have been explained to me, and I ' +
    'have had the chance to ask questions.',
  'I receive spa services at my own risk, and I accept responsibility for any ' +
    'complication that arises during or after a treatment carried out at my request.',
];

// ------------------------------------------------------------ what the desk reads

/**
 * Third person, for the screens where staff record a form the client filled in
 * on paper. The desk is confirming what happened, not agreeing to anything.
 */
export const WAIVER_STAFF =
  'Client signed the treatment consent and liability waiver — services and side ' +
  'effects explained, answers given in full, treatment at own risk.';
