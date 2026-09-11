import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_KINDS, campaignFromCode, campaignFor, pickedKinds, dueDateKey, dueToday,
} from '../src/lib/campaigns';
import { prefsOf, withPicked, MESSAGE_KINDS, type MessageKind } from '../src/lib/messages';
import { ADDONS } from '../src/lib/addon-catalogue';
import { manilaDateKey } from '../src/lib/datetime';

/** 14 February 2027, 3pm Manila — a wedding at a civilised hour. */
const EVENT = new Date('2027-02-14T07:00:00Z');
/**
 * The instant the cron fires on a given Manila morning.
 *
 * The schedule is `0 22 * * *` UTC and Manila is UTC+8, so six in the morning
 * on the 7th is twenty-two hundred on the SIXTH. Getting this backwards is how
 * a one-day reminder goes out two days early, so it is spelled out here rather
 * than left as an offset to hold in your head.
 */
const morningOf = (manilaDate: string) => {
  const utc = new Date(`${manilaDate}T00:00:00Z`);
  utc.setUTCDate(utc.getUTCDate() - 1);
  return new Date(`${utc.toISOString().slice(0, 10)}T22:00:00Z`);
};

test('the four scheduled messages are the four that were sold', () => {
  // The RSVP confirmation answers one guest on reply — not scheduled, not
  // bought by the band, and it must not be in here.
  assert.deepEqual([...CAMPAIGN_KINDS], ['sevenDay', 'oneDay', 'sameDay', 'thankYou']);
  assert.equal(CAMPAIGN_KINDS.includes('rsvpConfirmation' as MessageKind), false);
  for (const k of CAMPAIGN_KINDS) {
    assert.ok(MESSAGE_KINDS.some((m) => m.key === k), `${k} has no words written for it`);
  }
});

test('an add-on code says what it bought', () => {
  assert.deepEqual(campaignFromCode('SMS_REMINDER_250'), { code: 'SMS_REMINDER_250', email: false, allowance: 1, guests: 250 });
  assert.deepEqual(campaignFromCode('COMMS_BASIC_100'), { code: 'COMMS_BASIC_100', email: true, allowance: 1, guests: 100 });
  assert.deepEqual(campaignFromCode('COMMS_EXCLUSIVE_1000'), { code: 'COMMS_EXCLUSIVE_1000', email: true, allowance: 4, guests: 1000 });

  // Anything else is not a campaign, and must not be read as one.
  for (const code of ['QR_CHECKIN', 'SAVE_THE_DATE', 'RUSH', 'COMMS_GOLD_100', 'SMS_REMINDER_', '']) {
    assert.equal(campaignFromCode(code), null, `${code} was read as a campaign`);
  }
});

test('every campaign row in the catalogue parses, and nothing else does', () => {
  // The codes are parsed rather than held in a second table, so the catalogue
  // and the parser cannot disagree about what COMMS_DELUXE_1000 is.
  const held = ADDONS.filter((a) => a.held);
  assert.equal(held.length, 20);
  for (const row of held) {
    const c = campaignFromCode(row.code);
    assert.ok(c, `${row.code} is a held campaign row the parser does not understand`);
    assert.ok(c.guests > 0 && c.allowance >= 1 && c.allowance <= 4, `${row.code} parsed to nonsense`);
  }
  for (const row of ADDONS.filter((a) => !a.held)) {
    assert.equal(campaignFromCode(row.code), null, `${row.code} is for sale and was read as a campaign`);
  }
});

test('two campaigns give the better of each part, not the better row', () => {
  // Someone who bought texts for a thousand and then the Deluxe suite for 250
  // paid for both halves; picking one row whole takes one of them away.
  const both = campaignFor(['SMS_REMINDER_1000', 'COMMS_DELUXE_250']);
  assert.equal(both?.guests, 1000);
  assert.equal(both?.allowance, 3);
  assert.equal(both?.email, true);

  assert.equal(campaignFor([]), null);
  assert.equal(campaignFor(['QR_CHECKIN', 'PASSWORD']), null);
  assert.equal(campaignFor(['SMS_REMINDER_100'])?.email, false);
});

test('a couple sends what they picked, capped at what they bought', () => {
  const deluxe = campaignFromCode('COMMS_DELUXE_250')!;
  assert.deepEqual(pickedKinds(deluxe, ['thankYou', 'sevenDay']), ['sevenDay', 'thankYou'], 'sent in schedule order, not the order they were ticked');

  // Picking more than the allowance takes the earliest — never more than paid for.
  const basic = campaignFromCode('COMMS_BASIC_100')!;
  assert.deepEqual(pickedKinds(basic, [...CAMPAIGN_KINDS]), ['sevenDay']);

  // No choice is a real default, not silence: a campaign paid for and never
  // sent is the worse failure, and the page shows what is picked.
  assert.deepEqual(pickedKinds(basic, undefined), ['sevenDay']);
  assert.deepEqual(pickedKinds(basic, []), ['sevenDay']);
  assert.deepEqual(pickedKinds(campaignFromCode('COMMS_EXCLUSIVE_500')!, undefined), [...CAMPAIGN_KINDS]);

  // Something that is not a scheduled message cannot be smuggled in.
  assert.deepEqual(pickedKinds(basic, ['rsvpConfirmation' as MessageKind]), ['sevenDay']);
});

test('each message is due on its own day, in Manila', () => {
  assert.equal(dueDateKey('sevenDay', EVENT), '2027-02-07');
  assert.equal(dueDateKey('oneDay', EVENT), '2027-02-13');
  assert.equal(dueDateKey('sameDay', EVENT), '2027-02-14');
  assert.equal(dueDateKey('thankYou', EVENT), '2027-02-15');
  assert.equal(dueDateKey('rsvpConfirmation', EVENT), null, 'the confirmation has no day');
});

test('the job finds exactly the message due this morning, and nothing on other days', () => {
  const all = [...CAMPAIGN_KINDS];
  assert.equal(dueToday(all, EVENT, morningOf('2027-02-07')), 'sevenDay');
  assert.equal(dueToday(all, EVENT, morningOf('2027-02-13')), 'oneDay');
  assert.equal(dueToday(all, EVENT, morningOf('2027-02-14')), 'sameDay');
  assert.equal(dueToday(all, EVENT, morningOf('2027-02-15')), 'thankYou');

  // Every other day of that fortnight sends nothing at all.
  for (const day of ['2027-02-06', '2027-02-08', '2027-02-09', '2027-02-12', '2027-02-16', '2027-02-20']) {
    assert.equal(dueToday(all, EVENT, morningOf(day)), null, `${day} would have sent something`);
  }

  // A message they did not pick never goes, even on its own day.
  assert.equal(dueToday(['thankYou'], EVENT, morningOf('2027-02-07')), null);
  assert.equal(dueToday([], EVENT, morningOf('2027-02-14')), null);
});

test('an event just before midnight Manila is due on the right local day', () => {
  // 14 Feb 11pm Manila is still 14 Feb here and 15:00 UTC on the 14th. Read in
  // UTC the thank-you would land a day early, which is the whole reason these
  // are Manila date keys.
  const lateNight = new Date('2027-02-14T15:00:00Z');
  assert.equal(manilaDateKey(lateNight), '2027-02-14');
  assert.equal(dueDateKey('sameDay', lateNight), '2027-02-14');
  assert.equal(dueDateKey('thankYou', lateNight), '2027-02-15');
  assert.equal(dueToday([...CAMPAIGN_KINDS], lateNight, morningOf('2027-02-14')), 'sameDay');
});

test('the picked list is stored, read back, and survives the other edits', () => {
  const picked = withPicked({}, ['sevenDay', 'thankYou']);
  assert.deepEqual(picked.picked, ['sevenDay', 'thankYou']);
  assert.deepEqual(prefsOf(picked).picked, ['sevenDay', 'thankYou']);

  // Nonsense in the column is not a choice.
  assert.equal(prefsOf({ picked: 'sevenDay' }).picked, undefined);
  assert.equal(prefsOf({ picked: ['nope', 7] }).picked, undefined);
  assert.deepEqual(prefsOf({ picked: ['oneDay', 'nope'] }).picked, ['oneDay']);

  // Changing tone or rewriting a line must not drop what they chose to send.
  const withTone = { ...picked, tone: 'formal' as const };
  assert.deepEqual(prefsOf(withTone).picked, ['sevenDay', 'thankYou']);
});
