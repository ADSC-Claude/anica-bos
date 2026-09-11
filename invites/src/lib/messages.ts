import type { Occasion } from '@prisma/client';
import { OCCASION_BY_KEY } from './occasions';

/**
 * What a guest is sent, by occasion.
 *
 * Five moments, two tones, and a line for every occasion we sell. The couple
 * reads the ones for their own occasion, picks a tone, and edits any of them
 * before a single message goes out.
 *
 * Three things are deliberate here, because the brief this was written from —
 * a matrix of a hundred-odd sample lines — got them the other way round:
 *
 *   • Every message names who it is from. A text arrives from a sender ID, not
 *     a contact: "Tomorrow is the day. Thank you for being part of our
 *     wedding" reaches a guest as an unsigned message from YOUAREINVITED
 *     about somebody's wedding. So {{hosts}} is in every one of them.
 *
 *   • The reminders carry the date, and the two that a guest might act on
 *     carry the link. A reminder that does not say when is a reminder that
 *     sends someone looking for the invitation.
 *
 *   • A memorial is not a party. The generic wording — "special", "excited",
 *     "thank you for making it memorable" — is grotesque over a 40th-day Mass,
 *     so MEMORIAL is written separately rather than generated. Corporate is
 *     too, for a smaller reason: nobody calls the company Christmas party
 *     "our corporate event".
 *
 * Nothing here sends anything. src/lib/reminders.ts sends, and today it sends
 * one hand-pressed RSVP nudge; these are the words it and the scheduled
 * campaigns both draw from.
 */

/** The five moments a guest hears from the couple. */
export type MessageKind = 'rsvpConfirmation' | 'sevenDay' | 'oneDay' | 'sameDay' | 'thankYou';

/** How it is said. The couple picks one for all five. */
export type Tone = 'heartfelt' | 'formal';

export const MESSAGE_KINDS: { key: MessageKind; label: string; when: string; blurb: string }[] = [
  {
    key: 'rsvpConfirmation',
    label: 'RSVP confirmation',
    when: 'The moment a guest replies',
    blurb: 'Proof their reply landed. The one message that is a reply rather than a send, so it goes to one guest at a time and costs almost nothing.',
  },
  {
    key: 'sevenDay',
    label: '7-day reminder',
    when: 'One week before',
    blurb: 'Late enough to be real, early enough to book a day off or a ride. Carries the link, because this is the one people open to check the details.',
  },
  {
    key: 'oneDay',
    label: '1-day reminder',
    when: 'The day before',
    blurb: 'What time, where, and the link again. The message that saves the "anong oras nga ulit?" round of chats.',
  },
  {
    key: 'sameDay',
    label: 'Same-day reminder',
    when: 'The morning of',
    blurb: 'Short on purpose: it is read on a lock screen by someone already getting dressed.',
  },
  {
    key: 'thankYou',
    label: 'Thank you',
    when: 'The day after',
    blurb: 'Sent once, to everyone who came. The cheapest goodwill there is.',
  },
];

export const TONES: { key: Tone; label: string; blurb: string }[] = [
  { key: 'heartfelt', label: 'Heartfelt', blurb: 'Warm and personal — how most couples write to people they know.' },
  { key: 'formal', label: 'Formal', blurb: 'Plain and correct. Suits a corporate guest list, or a long one of near-strangers.' },
];

export type MessageText = {
  /** One SMS. Kept short — a text is charged by the segment. */
  sms: string;
  emailSubject: string;
  emailBody: string;
};

/**
 * The noun each occasion puts in the middle of a sentence: "…until {{event}}".
 *
 * Written as the hosts would say it, which is not always the label. A family
 * says "the christening", not "our Christening / Dedication", and a debut is
 * as often sent by the parents as by the debutante.
 */
const OCCASION_EVENT: Record<Occasion, string> = {
  WEDDING: 'our wedding',
  DEBUT: 'the debut',
  CHRISTENING: 'the christening',
  KIDS_BIRTHDAY: 'the birthday party',
  MILESTONE_BIRTHDAY: 'the birthday celebration',
  BABY_SHOWER: 'the baby shower',
  ANNIVERSARY: 'our anniversary',
  ENGAGEMENT: 'our engagement',
  GRADUATION: 'the thanksgiving celebration',
  COMMUNION: 'the First Communion',
  CORPORATE: 'the event',
  HOUSEWARMING: 'the house blessing',
  REUNION: 'the reunion',
  MEMORIAL: 'the Mass',
};

/**
 * The generic set, in both tones.
 *
 * {{event}} is filled from OCCASION_EVENT above; the rest are the variables
 * every message may use — see MESSAGE_VARS.
 *
 * Every SMS line is written to fit ONE segment — 160 GSM-7 characters, link
 * included — and tests/messages.test.ts holds them there against a twenty-
 * character host name, which is about as long as "Acme Christmas Party". Two
 * things will break that, and both are meant to be visible rather than
 * prevented: a couple whose own title runs longer, and any character outside
 * GSM-7. The em-dash is the one that catches people — it is not in GSM-7, so a
 * single one drops the whole message to UCS-2 and 70 characters, doubling what
 * every guest costs. The e-mails keep their typography; they are free.
 */
const BASE: Record<MessageKind, Record<Tone, MessageText>> = {
  rsvpConfirmation: {
    heartfelt: {
      sms: 'Salamat, {{guestName}}! We have your reply for {{event}} on {{eventDate}}. See you there. - {{hosts}}',
      emailSubject: 'We have your reply — {{hosts}}, {{eventDate}}',
      emailBody:
        'Hi {{guestName}},\n\nThank you — your reply for {{event}} is in, and we could not be happier that you are coming.\n\n{{hosts}}\n{{eventDate}}\n\nIf anything changes, your invitation is here and you can update your reply on the same link:\n{{link}}\n\nSee you soon!\n{{hosts}}',
    },
    formal: {
      sms: 'Thank you, {{guestName}}. Your attendance on {{eventDate}} is confirmed. - {{hosts}}',
      emailSubject: 'RSVP confirmed — {{hosts}}, {{eventDate}}',
      emailBody:
        'Dear {{guestName}},\n\nYour attendance for {{event}} has been confirmed.\n\n{{hosts}}\n{{eventDate}}\n\nShould your plans change, you may update your reply on the same link:\n{{link}}\n\nWe look forward to welcoming you.\n\n{{hosts}}',
    },
  },
  sevenDay: {
    heartfelt: {
      sms: 'One week to go, {{guestName}}! {{hosts}} on {{eventDate}}. Details here: {{link}}',
      emailSubject: 'One week to go — {{hosts}}, {{eventDate}}',
      emailBody:
        'Hi {{guestName}},\n\nOne week until {{event}}. We are so glad you will be with us.\n\n{{hosts}}\n{{eventDate}}\n\nEverything you need — the time, the place and the map — is on your invitation:\n{{link}}\n\nSee you very soon!\n{{hosts}}',
    },
    formal: {
      sms: '{{guestName}}, a reminder: {{hosts}} on {{eventDate}}, one week away. Details: {{link}}',
      emailSubject: 'Reminder: {{hosts}} — {{eventDate}}',
      emailBody:
        'Dear {{guestName}},\n\nThis is a reminder that {{event}} will take place in one week.\n\n{{hosts}}\n{{eventDate}}\n\nThe time, venue and directions are on your invitation:\n{{link}}\n\nWe look forward to welcoming you.\n\n{{hosts}}',
    },
  },
  oneDay: {
    heartfelt: {
      sms: 'Tomorrow, {{guestName}}! {{hosts}}, {{eventDate}}. Time and place: {{link}}',
      emailSubject: 'Tomorrow — {{hosts}}, {{eventDate}}',
      emailBody:
        'Hi {{guestName}},\n\nTomorrow is the day. Thank you for being part of {{event}}.\n\n{{hosts}}\n{{eventDate}}\n\nThe time, the venue and the map are all here:\n{{link}}\n\nTravel safe — see you tomorrow!\n{{hosts}}',
    },
    formal: {
      sms: '{{guestName}}, a reminder that {{hosts}} is tomorrow, {{eventDate}}. Details: {{link}}',
      emailSubject: 'Tomorrow: {{hosts}} — {{eventDate}}',
      emailBody:
        'Dear {{guestName}},\n\nA reminder that {{event}} is scheduled for tomorrow.\n\n{{hosts}}\n{{eventDate}}\n\nThe time, venue and directions are on your invitation:\n{{link}}\n\nWe look forward to welcoming you.\n\n{{hosts}}',
    },
  },
  sameDay: {
    heartfelt: {
      sms: 'Today is the day, {{guestName}}! We cannot wait to see you. - {{hosts}}',
      emailSubject: 'Today — {{hosts}}',
      emailBody:
        'Hi {{guestName}},\n\nToday is the day. We cannot wait to see you at {{event}}.\n\n{{hosts}}\n{{eventDate}}\n\nIf you need the address or the time one more time, it is here:\n{{link}}\n\nTravel safe!\n{{hosts}}',
    },
    formal: {
      sms: '{{guestName}}, a reminder that {{hosts}} takes place today. We look forward to seeing you.',
      emailSubject: 'Today: {{hosts}}',
      emailBody:
        'Dear {{guestName}},\n\nThis is a reminder that {{event}} takes place today.\n\n{{hosts}}\n{{eventDate}}\n\nThe address and schedule remain on your invitation:\n{{link}}\n\nWe look forward to welcoming you.\n\n{{hosts}}',
    },
  },
  thankYou: {
    heartfelt: {
      sms: 'Thank you for being with us, {{guestName}}. You made the day. - {{hosts}}',
      emailSubject: 'Thank you — {{hosts}}',
      emailBody:
        'Hi {{guestName}},\n\nThank you for being with us — {{event}} would not have been the same without you, and we are still smiling about it.\n\nWith love,\n{{hosts}}',
    },
    formal: {
      sms: 'Thank you for attending, {{guestName}}. We appreciate you being there. - {{hosts}}',
      emailSubject: 'Thank you for attending — {{hosts}}',
      emailBody:
        'Dear {{guestName}},\n\nThank you for attending {{event}}. Your presence was very much appreciated.\n\nWith our thanks,\n{{hosts}}',
    },
  },
};

/**
 * Occasions the generic set does not fit, written out instead of generated.
 *
 * MEMORIAL is the reason this exists. Every warm word in BASE — the day, the
 * excitement, making it memorable — is wrong over a 40th-day Mass, and a
 * wrong word there is worse than no message at all. It keeps the reminders,
 * because a family does still need to tell people when the Mass is, and loses
 * the tone.
 *
 * CORPORATE is milder: the lines are fine, but "our event" and "we cannot
 * wait" do not sound like an office sending to a guest list, so the heartfelt
 * tone is pulled towards the formal one.
 */
const OVERRIDES: Partial<Record<Occasion, Partial<Record<MessageKind, Partial<Record<Tone, MessageText>>>>>> = {
  MEMORIAL: {
    rsvpConfirmation: {
      heartfelt: {
        sms: 'Thank you, {{guestName}}. We have your reply for {{eventDate}}. - {{hosts}}',
        emailSubject: 'Thank you for your reply — {{hosts}}, {{eventDate}}',
        emailBody:
          'Dear {{guestName}},\n\nThank you for letting us know you can join us.\n\n{{hosts}}\n{{eventDate}}\n\nThe details are here, and you may update your reply on the same link:\n{{link}}\n\nWith our thanks,\n{{hosts}}',
      },
      formal: {
        sms: 'Thank you, {{guestName}}. Your attendance on {{eventDate}} is noted. - {{hosts}}',
        emailSubject: 'Attendance noted — {{hosts}}, {{eventDate}}',
        emailBody:
          'Dear {{guestName}},\n\nThank you. Your attendance has been noted.\n\n{{hosts}}\n{{eventDate}}\n\nThe details are here:\n{{link}}\n\nWith our thanks,\n{{hosts}}',
      },
    },
    sevenDay: {
      heartfelt: {
        sms: '{{guestName}}, the Mass for {{hosts}} is on {{eventDate}}, one week away. Details: {{link}}',
        emailSubject: '{{hosts}} — {{eventDate}}',
        emailBody:
          'Dear {{guestName}},\n\nA gentle reminder that the Mass will be held in one week.\n\n{{hosts}}\n{{eventDate}}\n\nThe time, the church and the directions are here:\n{{link}}\n\nWith our thanks,\n{{hosts}}',
      },
      formal: {
        sms: '{{guestName}}, the Mass for {{hosts}} will be held on {{eventDate}}. Details: {{link}}',
        emailSubject: '{{hosts}} — {{eventDate}}',
        emailBody:
          'Dear {{guestName}},\n\nThis is to remind you that the Mass will be held in one week.\n\n{{hosts}}\n{{eventDate}}\n\nThe time, venue and directions are here:\n{{link}}\n\nWith our thanks,\n{{hosts}}',
      },
    },
    oneDay: {
      heartfelt: {
        sms: '{{guestName}}, the Mass for {{hosts}} is tomorrow, {{eventDate}}. Details: {{link}}',
        emailSubject: 'Tomorrow — {{hosts}}',
        emailBody:
          'Dear {{guestName}},\n\nA gentle reminder that the Mass is tomorrow.\n\n{{hosts}}\n{{eventDate}}\n\nThe time, the church and the directions are here:\n{{link}}\n\nWith our thanks,\n{{hosts}}',
      },
      formal: {
        sms: '{{guestName}}, the Mass for {{hosts}} is tomorrow, {{eventDate}}. Details: {{link}}',
        emailSubject: 'Tomorrow — {{hosts}}',
        emailBody:
          'Dear {{guestName}},\n\nThis is to remind you that the Mass will be held tomorrow.\n\n{{hosts}}\n{{eventDate}}\n\nThe time, venue and directions are here:\n{{link}}\n\nWith our thanks,\n{{hosts}}',
      },
    },
    sameDay: {
      heartfelt: {
        sms: '{{guestName}}, the Mass for {{hosts}} is today. Thank you for being with us.',
        emailSubject: 'Today — {{hosts}}',
        emailBody:
          'Dear {{guestName}},\n\nThe Mass is today. Thank you for being with us.\n\n{{hosts}}\n{{eventDate}}\n\nThe address and time are here:\n{{link}}\n\nWith our thanks,\n{{hosts}}',
      },
      formal: {
        sms: '{{guestName}}, the Mass for {{hosts}} will be held today.',
        emailSubject: 'Today — {{hosts}}',
        emailBody:
          'Dear {{guestName}},\n\nThis is to remind you that the Mass will be held today.\n\n{{hosts}}\n{{eventDate}}\n\nThe address and time are here:\n{{link}}\n\nWith our thanks,\n{{hosts}}',
      },
    },
    thankYou: {
      heartfelt: {
        sms: 'Thank you for being with us, {{guestName}}. It meant a great deal. - {{hosts}}',
        emailSubject: 'Thank you — {{hosts}}',
        emailBody:
          'Dear {{guestName}},\n\nThank you for being with us, and for your prayers. It meant a great deal to our family.\n\nWith our thanks,\n{{hosts}}',
      },
      formal: {
        sms: 'Thank you for joining us, {{guestName}}. It was appreciated. - {{hosts}}',
        emailSubject: 'Thank you — {{hosts}}',
        emailBody:
          'Dear {{guestName}},\n\nThank you for joining us. Your presence and your prayers were deeply appreciated.\n\nWith our thanks,\n{{hosts}}',
      },
    },
  },
  CORPORATE: {
    rsvpConfirmation: {
      heartfelt: {
        sms: 'Thank you, {{guestName}}! Your slot on {{eventDate}} is confirmed. - {{hosts}}',
        emailSubject: 'You are confirmed — {{hosts}}, {{eventDate}}',
        emailBody:
          'Hi {{guestName}},\n\nThank you — your place is confirmed and we are glad you can join us.\n\n{{hosts}}\n{{eventDate}}\n\nThe programme and venue are here, and you can update your reply on the same link:\n{{link}}\n\nSee you there,\n{{hosts}}',
      },
    },
    sevenDay: {
      heartfelt: {
        sms: '{{guestName}}, one week to go: {{hosts}} on {{eventDate}}. Programme: {{link}}',
        emailSubject: 'One week to go — {{hosts}}, {{eventDate}}',
        emailBody:
          'Hi {{guestName}},\n\nOne week until {{hosts}}. We are glad you will be joining us.\n\n{{eventDate}}\n\nThe programme, venue and directions are here:\n{{link}}\n\nSee you there,\n{{hosts}}',
      },
    },
    sameDay: {
      heartfelt: {
        sms: '{{guestName}}, {{hosts}} is today. See you there!',
        emailSubject: 'Today — {{hosts}}',
        emailBody:
          'Hi {{guestName}},\n\n{{hosts}} is today. We look forward to seeing you.\n\n{{eventDate}}\n\nThe venue and programme are here:\n{{link}}\n\nSee you there,\n{{hosts}}',
      },
    },
    thankYou: {
      heartfelt: {
        sms: 'Thank you for joining us, {{guestName}}. - {{hosts}}',
        emailSubject: 'Thank you for joining us — {{hosts}}',
        emailBody:
          'Hi {{guestName}},\n\nThank you for joining us at {{hosts}}. We appreciate you taking the time.\n\nWith thanks,\n{{hosts}}',
      },
    },
  },
};

/**
 * What a message may say, and where each piece comes from. Shown beside the
 * editor so a couple knows what they may move, and read by the test that keeps
 * the library from referring to a variable nothing fills in.
 */
export const MESSAGE_VARS: { key: string; label: string; example: string }[] = [
  { key: 'guestName', label: "The guest's name", example: 'Tita Baby' },
  { key: 'hosts', label: 'Who it is from', example: 'Juan & Maria' },
  { key: 'eventDate', label: 'The date of the day', example: '14 February 2027' },
  { key: 'event', label: 'What is being celebrated', example: 'our wedding' },
  { key: 'link', label: "The guest's own invitation link", example: 'youreinvitedto.com/juan-and-maria/rLvuqMyw' },
];

/** The wording for one occasion, one moment, one tone — before any edits. */
export function messageFor(occasion: Occasion, kind: MessageKind, tone: Tone): MessageText {
  return OVERRIDES[occasion]?.[kind]?.[tone] ?? BASE[kind][tone];
}

/** Every message for an occasion in one tone, in the order they are sent. */
export function messagesFor(occasion: Occasion, tone: Tone): { kind: MessageKind; text: MessageText }[] {
  return MESSAGE_KINDS.map((k) => ({ kind: k.key, text: messageFor(occasion, k.key, tone) }));
}

/**
 * Fills {{event}} from the occasion, leaving every other variable for the
 * sender to fill at send time. Kept separate because {{event}} is the one
 * variable this library knows and reminders.ts does not.
 */
export function withEvent(template: string, occasion: Occasion): string {
  return template.replace(/\{\{event\}\}/g, OCCASION_EVENT[occasion] ?? 'the celebration');
}

/** What a guest is told the message is about, for the occasion. */
export function eventPhrase(occasion: Occasion): string {
  return OCCASION_EVENT[occasion] ?? 'the celebration';
}

/**
 * Who the text appears to be from on a guest's phone.
 *
 * A text has no contact card behind it: the guest sees this name and the
 * message, nothing else. Which is why every line in this file signs itself —
 * see the note at the top.
 *
 * This is the working name until the registered one comes through. Worth
 * checking before registering it: an alphanumeric sender ID is capped at
 * ELEVEN characters across GSM networks, and "YouAreInvited" is thirteen. If
 * Semaphore holds to that cap, the name has to lose two characters —
 * "YouInvited" (10) and "YoureInvited" (12, still over) are the obvious
 * candidates, and it is much better to find that out now than after it is
 * printed on something. smsSenderTooLong flags it in the admin field.
 */
export const SMS_SENDER_FALLBACK = 'YouAreInvited';

/** The common GSM cap on an alphanumeric sender ID. */
export const SMS_SENDER_MAX = 11;

/** The sender ID a guest will see, given whatever the admin has registered. */
export function smsSender(registered: string | undefined): string {
  const name = (registered ?? '').trim();
  return name || SMS_SENDER_FALLBACK;
}

/**
 * Whether a sender ID is longer than networks usually accept. A warning, not a
 * refusal: this is Semaphore's rule to enforce, not ours, and a carrier that
 * allows more should not be argued with by our own form.
 */
export function smsSenderTooLong(name: string): boolean {
  return name.trim().length > SMS_SENDER_MAX;
}

/** Who an e-mail appears to be from, given the business name. */
export function emailSender(businessName: string, occasion: Occasion): string {
  const hosts = OCCASION_BY_KEY[occasion]?.hostsNoun ?? 'the hosts';
  return `${businessName} on behalf of ${hosts}`;
}

// ---------------------------------------------------------------------------
// What a particular couple sends
// ---------------------------------------------------------------------------

/**
 * A couple's choices, stored on the invitation.
 *
 * Only the differences are kept. A couple who picked "formal" and rewrote the
 * thank-you stores exactly that, so the four lines they left alone improve
 * whenever the library does — and a rewritten line is never quietly replaced.
 */
export type MessagePrefs = {
  tone?: Tone;
  overrides?: Partial<Record<MessageKind, Partial<MessageText>>>;
  /**
   * Which of the scheduled messages the couple chose, when their campaign
   * covers fewer than all four. Empty or absent means they have not chosen and
   * the earliest ones go — see pickedKinds in src/lib/campaigns.ts.
   */
  picked?: MessageKind[];
};

export const DEFAULT_TONE: Tone = 'heartfelt';

/** Reads the stored JSON without trusting it: it is a column, not a type. */
export function prefsOf(raw: unknown): MessagePrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const tone = obj.tone === 'formal' || obj.tone === 'heartfelt' ? obj.tone : undefined;
  const overrides: MessagePrefs['overrides'] = {};
  const stored = obj.overrides;
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const k of MESSAGE_KINDS) {
      const one = (stored as Record<string, unknown>)[k.key];
      if (!one || typeof one !== 'object' || Array.isArray(one)) continue;
      const o = one as Record<string, unknown>;
      const picked: Partial<MessageText> = {};
      if (typeof o.sms === 'string') picked.sms = o.sms;
      if (typeof o.emailSubject === 'string') picked.emailSubject = o.emailSubject;
      if (typeof o.emailBody === 'string') picked.emailBody = o.emailBody;
      if (Object.keys(picked).length) overrides[k.key] = picked;
    }
  }
  const kinds = new Set(MESSAGE_KINDS.map((k) => k.key as string));
  const picked = Array.isArray(obj.picked)
    ? (obj.picked.filter((k): k is MessageKind => typeof k === 'string' && kinds.has(k)) as MessageKind[])
    : undefined;

  return {
    ...(tone ? { tone } : {}),
    ...(Object.keys(overrides).length ? { overrides } : {}),
    ...(picked?.length ? { picked } : {}),
  };
}

export type ResolvedMessage = {
  kind: MessageKind;
  label: string;
  when: string;
  blurb: string;
  text: MessageText;
  /** True where this couple rewrote the line rather than taking the stock one. */
  edited: { sms: boolean; emailSubject: boolean; emailBody: boolean };
};

/**
 * The five messages this invitation would actually send: the library's words
 * for its occasion and tone, with the couple's own rewrites on top, and
 * {{event}} already filled in.
 *
 * Every other variable is left standing, because they are filled per guest at
 * send time — which is also what makes the preview honest, since it fills them
 * with one guest's details rather than pretending the stored line is finished.
 */
export function resolveMessages(occasion: Occasion, raw: unknown): ResolvedMessage[] {
  const prefs = prefsOf(raw);
  const tone = prefs.tone ?? DEFAULT_TONE;
  return MESSAGE_KINDS.map((k) => {
    const stock = messageFor(occasion, k.key, tone);
    const own = prefs.overrides?.[k.key] ?? {};
    return {
      kind: k.key,
      label: k.label,
      when: k.when,
      blurb: k.blurb,
      text: {
        sms: withEvent(own.sms ?? stock.sms, occasion),
        emailSubject: withEvent(own.emailSubject ?? stock.emailSubject, occasion),
        emailBody: withEvent(own.emailBody ?? stock.emailBody, occasion),
      },
      edited: {
        sms: own.sms !== undefined,
        emailSubject: own.emailSubject !== undefined,
        emailBody: own.emailBody !== undefined,
      },
    };
  });
}

/**
 * Stores one rewritten message, or clears it back to the library's words.
 *
 * A line that matches the stock one is stored as no override at all, so
 * "reset" and "retype it exactly as it was" mean the same thing — and neither
 * leaves a copy behind that would stop improving when the library does.
 */
export function withOverride(
  raw: unknown,
  occasion: Occasion,
  kind: MessageKind,
  patch: Partial<MessageText>,
): MessagePrefs {
  const prefs = prefsOf(raw);
  const tone = prefs.tone ?? DEFAULT_TONE;
  const stock = messageFor(occasion, kind, tone);
  const merged: Partial<MessageText> = { ...(prefs.overrides?.[kind] ?? {}), ...patch };

  for (const field of ['sms', 'emailSubject', 'emailBody'] as const) {
    const value = merged[field];
    if (value === undefined) continue;
    if (value.trim() === '' || value.trim() === stock[field].trim()) delete merged[field];
  }

  const overrides = { ...(prefs.overrides ?? {}) };
  if (Object.keys(merged).length) overrides[kind] = merged;
  else delete overrides[kind];

  return {
    ...(prefs.tone ? { tone: prefs.tone } : {}),
    ...(Object.keys(overrides).length ? { overrides } : {}),
    ...(prefs.picked?.length ? { picked: prefs.picked } : {}),
  };
}

/** Changes the tone, keeping every line the couple rewrote themselves. */
export function withTone(raw: unknown, tone: Tone): MessagePrefs {
  const prefs = prefsOf(raw);
  return { ...prefs, tone };
}

/** Records which scheduled messages the couple chose, keeping everything else. */
export function withPicked(raw: unknown, picked: MessageKind[]): MessagePrefs {
  const prefs = prefsOf(raw);
  const kinds = new Set(MESSAGE_KINDS.map((k) => k.key));
  const clean = picked.filter((k) => kinds.has(k));
  return { ...prefs, ...(clean.length ? { picked: clean } : { picked: undefined }) };
}
