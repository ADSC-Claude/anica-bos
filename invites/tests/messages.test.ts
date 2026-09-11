import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGE_KINDS, TONES, MESSAGE_VARS, messageFor, messagesFor, resolveMessages,
  withEvent, eventPhrase, prefsOf, withOverride, withTone, smsSender, smsSenderTooLong,
  SMS_SENDER_FALLBACK, SMS_SENDER_MAX, DEFAULT_TONE, type MessageKind, type Tone,
} from '../src/lib/messages';
import { OCCASIONS } from '../src/lib/occasions';
import type { Occasion } from '@prisma/client';

const ALL: Occasion[] = OCCASIONS.map((o) => o.key);
const KINDS: MessageKind[] = MESSAGE_KINDS.map((k) => k.key);
const TONE_KEYS: Tone[] = TONES.map((t) => t.key);

/** What the variables become for a realistic Filipino wedding. */
const VARS: Record<string, string> = {
  guestName: 'Tita Baby',
  hosts: 'Juan & Maria',
  eventDate: '14 February 2027',
  link: 'https://youreinvitedto.com/juan-and-maria/rLvuqMyw01oHsq8Ty5QaoBDh',
};

function fill(t: string, occasion: Occasion): string {
  return withEvent(t, occasion).replace(/\{\{(\w+)\}\}/g, (_, k: string) => VARS[k] ?? `«${k}»`);
}

test('every occasion has every message in both tones', () => {
  for (const occasion of ALL) {
    for (const kind of KINDS) {
      for (const tone of TONE_KEYS) {
        const m = messageFor(occasion, kind, tone);
        assert.ok(m.sms.trim(), `${occasion}/${kind}/${tone} has no text message`);
        assert.ok(m.emailSubject.trim(), `${occasion}/${kind}/${tone} has no subject`);
        assert.ok(m.emailBody.trim(), `${occasion}/${kind}/${tone} has no e-mail`);
      }
    }
    assert.ok(eventPhrase(occasion).trim(), `${occasion} has no phrase for itself`);
  }
});

test('every message says who it is from', () => {
  // A text arrives from a sender ID, not a contact. A guest who cannot tell
  // whose wedding it is has been sent nothing.
  for (const occasion of ALL) {
    for (const kind of KINDS) {
      for (const tone of TONE_KEYS) {
        const m = messageFor(occasion, kind, tone);
        assert.match(m.sms, /\{\{hosts\}\}/, `${occasion}/${kind}/${tone} text does not name the hosts`);
        assert.match(
          `${m.emailSubject} ${m.emailBody}`, /\{\{hosts\}\}/,
          `${occasion}/${kind}/${tone} e-mail does not name the hosts`,
        );
      }
    }
  }
});

test('the reminders say when, and the ones a guest acts on carry the link', () => {
  for (const occasion of ALL) {
    for (const tone of TONE_KEYS) {
      for (const kind of ['sevenDay', 'oneDay'] as MessageKind[]) {
        const m = messageFor(occasion, kind, tone);
        assert.match(m.sms, /\{\{eventDate\}\}|tomorrow|today/i, `${occasion}/${kind}/${tone} never says when`);
        assert.match(m.sms, /\{\{link\}\}/, `${occasion}/${kind}/${tone} sends them looking for the invitation`);
      }
      // Every e-mail has room for the link; only the thank-you has no reason to.
      for (const kind of KINDS.filter((k) => k !== 'thankYou')) {
        assert.match(messageFor(occasion, kind, tone).emailBody, /\{\{link\}\}/, `${occasion}/${kind}/${tone} e-mail has no link`);
      }
    }
  }
});

test('no message uses a variable nothing fills in', () => {
  const known = new Set(MESSAGE_VARS.map((v) => v.key));
  for (const occasion of ALL) {
    for (const kind of KINDS) {
      for (const tone of TONE_KEYS) {
        const m = messageFor(occasion, kind, tone);
        for (const field of [m.sms, m.emailSubject, m.emailBody]) {
          for (const [, key] of field.matchAll(/\{\{(\w+)\}\}/g)) {
            assert.ok(known.has(key), `${occasion}/${kind}/${tone} uses {{${key}}}, which nothing fills in`);
          }
        }
      }
    }
  }
});

test('a memorial is not sent a party', () => {
  // The generic library is written for a celebration. Every warm word in it is
  // wrong over a 40th-day Mass, and a wrong word there is worse than silence.
  const forbidden = /\b(special|excited|cannot wait|can't wait|memorable|party|celebrat|congratulat|salamat!)/i;
  for (const kind of KINDS) {
    for (const tone of TONE_KEYS) {
      const m = messageFor('MEMORIAL', kind, tone);
      for (const [name, field] of Object.entries(m)) {
        assert.doesNotMatch(field, forbidden, `MEMORIAL/${kind}/${tone} ${name} reads like a party`);
      }
    }
  }
  // and it is genuinely its own wording, not the generic set
  assert.notEqual(messageFor('MEMORIAL', 'thankYou', 'heartfelt').sms, messageFor('WEDDING', 'thankYou', 'heartfelt').sms);
});

test('a text is written in characters a text can carry', () => {
  // GSM-7 fits 160 characters to a segment. One character outside it — an
  // em-dash in a sign-off, a curly apostrophe pasted from Word — switches the
  // whole message to UCS-2, which fits 70, and quietly doubles the bill for
  // every guest. This caught exactly that in the sign-offs.
  const GSM7 =
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
    '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà' +
    '^{}\\[~]|€';

  for (const occasion of ALL) {
    for (const kind of KINDS) {
      for (const tone of TONE_KEYS) {
        const text = fill(messageFor(occasion, kind, tone).sms, occasion);
        const stray = [...text].filter((c) => !GSM7.includes(c));
        assert.deepEqual(stray, [], `${occasion}/${kind}/${tone} costs double for: ${stray.join(' ')}`);
      }
    }
  }
});

test('a text costs what we think it costs', async () => {
  // Semaphore charges by the segment, per guest. A line that quietly runs to
  // three segments triples the bill on a five-hundred-guest blast, so the
  // budget is asserted rather than hoped for.
  const { creditsFor } = await import('../src/lib/sms');
  const budget: Record<MessageKind, number> = {
    // No link, so these must fit one segment.
    rsvpConfirmation: 1,
    sameDay: 1,
    thankYou: 1,
    // These carry a 65-character personal link, which costs a second segment.
    sevenDay: 2,
    oneDay: 2,
  };

  for (const occasion of ALL) {
    for (const kind of KINDS) {
      for (const tone of TONE_KEYS) {
        const text = fill(messageFor(occasion, kind, tone).sms, occasion);
        const segments = creditsFor(text);
        assert.ok(
          segments <= budget[kind],
          `${occasion}/${kind}/${tone} costs ${segments} segments (budget ${budget[kind]}): ${text.length} chars — ${text}`,
        );
      }
    }
  }
});

test('a filled-in message leaves nothing dangling', () => {
  for (const occasion of ALL) {
    for (const kind of KINDS) {
      for (const tone of TONE_KEYS) {
        const m = messageFor(occasion, kind, tone);
        for (const field of [m.sms, m.emailSubject, m.emailBody]) {
          const filled = fill(field, occasion);
          assert.doesNotMatch(filled, /\{\{|«/, `${occasion}/${kind}/${tone} still has a placeholder: ${filled}`);
          // Doubled spaces and space-before-punctuation are what a missing
          // variable leaves behind. Blank lines are not: an e-mail is
          // paragraphs, so only runs of spaces count.
          assert.doesNotMatch(filled, / {2,}| [.,!]/, `${occasion}/${kind}/${tone} reads badly once filled: ${filled}`);
        }
      }
    }
  }
});

test('nothing that gets filled in lands at the start of a sentence', () => {
  // {{event}} is a lower-case noun phrase — "our wedding", "the christening".
  // Put one after a full stop and the message reads "Thank you for being with
  // us. our wedding would not have been the same", which is what this caught.
  // {{hosts}} is exempt: it is a name, and a name may open a sentence.
  const sentenceStart = /(^|[.!?]\s+|\n)\{\{event\}\}/;
  for (const occasion of ALL) {
    for (const kind of KINDS) {
      for (const tone of TONE_KEYS) {
        const m = messageFor(occasion, kind, tone);
        for (const [name, field] of [['sms', m.sms], ['emailSubject', m.emailSubject], ['emailBody', m.emailBody]] as const) {
          assert.doesNotMatch(field, sentenceStart, `${occasion}/${kind}/${tone} ${name} starts a sentence with a lower-case phrase`);
        }
      }
    }
  }
});

test('the stored preferences are read without being trusted', () => {
  assert.deepEqual(prefsOf(null), {});
  assert.deepEqual(prefsOf('nonsense'), {});
  assert.deepEqual(prefsOf([1, 2]), {});
  assert.deepEqual(prefsOf({ tone: 'shouty' }), {}, 'an unknown tone is not a tone');
  assert.deepEqual(prefsOf({ tone: 'formal' }), { tone: 'formal' });
  assert.deepEqual(prefsOf({ overrides: { sevenDay: { sms: 42 } } }), {}, 'a number is not a message');
  assert.deepEqual(
    prefsOf({ overrides: { sevenDay: { sms: 'mine' }, notAKind: { sms: 'x' } } }),
    { overrides: { sevenDay: { sms: 'mine' } } },
  );
});

test('a rewritten line survives a change of tone, and a stock one does not', () => {
  let prefs: unknown = withOverride({}, 'WEDDING', 'thankYou', { sms: 'Maraming salamat po! — {{hosts}}' });
  assert.equal(prefsOf(prefs).overrides?.thankYou?.sms, 'Maraming salamat po! — {{hosts}}');

  prefs = withTone(prefs, 'formal');
  const resolved = resolveMessages('WEDDING', prefs);
  const thanks = resolved.find((r) => r.kind === 'thankYou')!;
  const sevenDay = resolved.find((r) => r.kind === 'sevenDay')!;

  assert.equal(thanks.text.sms, 'Maraming salamat po! — {{hosts}}', 'their own words were overwritten');
  assert.equal(thanks.edited.sms, true);
  assert.equal(sevenDay.text.sms, withEvent(messageFor('WEDDING', 'sevenDay', 'formal').sms, 'WEDDING'), 'a stock line did not follow the tone');
  assert.equal(sevenDay.edited.sms, false);
});

test('retyping our words exactly, or clearing the box, stores no override', () => {
  const stock = messageFor('DEBUT', 'sameDay', DEFAULT_TONE);
  assert.deepEqual(withOverride({}, 'DEBUT', 'sameDay', { sms: stock.sms }), {}, 'an identical line is not an edit');
  assert.deepEqual(withOverride({}, 'DEBUT', 'sameDay', { sms: `  ${stock.sms}  ` }), {}, 'whitespace is not an edit');

  const edited = withOverride({}, 'DEBUT', 'sameDay', { sms: 'Mine' });
  assert.deepEqual(withOverride(edited, 'DEBUT', 'sameDay', { sms: '' }), {}, 'clearing the box did not reset it');
});

test('resolveMessages fills in the occasion and nothing else', () => {
  for (const m of resolveMessages('CHRISTENING', {})) {
    assert.doesNotMatch(m.text.sms + m.text.emailBody, /\{\{event\}\}/, 'the occasion was left as a placeholder');
    assert.match(m.text.emailBody, /\{\{guestName\}\}/, 'the guest is filled in per guest, not here');
  }
  assert.match(resolveMessages('CHRISTENING', {})[0].text.sms, /christening|{{hosts}}/);
  assert.equal(resolveMessages('WEDDING', {}).length, MESSAGE_KINDS.length);
  assert.equal(messagesFor('WEDDING', 'formal').length, MESSAGE_KINDS.length);
});

test('the sender name is the one we can actually register', () => {
  assert.equal(smsSender(''), SMS_SENDER_FALLBACK);
  assert.equal(smsSender(undefined), SMS_SENDER_FALLBACK);
  assert.equal(smsSender('  Invited  '), 'Invited');

  assert.equal(smsSenderTooLong('Invited'), false);
  assert.equal(smsSenderTooLong('YouAreInvited'), true, 'thirteen characters is over the usual cap');
  assert.equal(SMS_SENDER_MAX, 11);
  // The working name is over the cap on purpose — it is what we were asked to
  // show until the registered one comes through, and the page says so.
  assert.equal(smsSenderTooLong(SMS_SENDER_FALLBACK), true);
});
