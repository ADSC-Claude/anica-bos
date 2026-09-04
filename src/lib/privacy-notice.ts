import type { Settings } from './settings-defaults';

/**
 * The privacy notice a client reads, built from what the system actually does.
 *
 * Kept beside consent.ts for the same reason consent.ts exists at all: the tick
 * box on the booking form and the page explaining it have to say the same
 * thing, and a notice that has drifted from the consent beside it is worse than
 * having neither. The tick box is the short version; this is the long one, and
 * neither may promise what the software does not do.
 *
 * Built from `Settings` rather than written out flat, so the retention periods
 * quoted to a client are the periods the nightly job is actually enforcing. A
 * notice that says "one year" while the setting says three is not a drafting
 * mistake, it is a false statement to the person it was written for.
 *
 * Nothing here is legal advice, and it is deliberately not a template pulled
 * off a website: every claim below is one this codebase can be read against.
 * What it cannot do is know the spa's own circumstances — whether a Data
 * Protection Officer has been named, whether the NPC registration thresholds
 * are met — which is why those are settings and why the README says to check.
 */

export type NoticeSection = {
  heading: string;
  /** Paragraphs. Rendered in order, with blank lines between. */
  body: string[];
  /** Optional bulleted list, rendered after the paragraphs. */
  bullets?: string[];
};

/**
 * Bumped by hand whenever the wording below changes in a way a client would
 * care about. Shown on the page so somebody who read it in March can tell
 * whether they are looking at the same document.
 */
export const NOTICE_EFFECTIVE = '7 August 2026';

function plural(days: number): string {
  if (days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? 'one year' : `${years} years`;
  }
  return `${days} days`;
}

export function buildPrivacyNotice(s: Settings): NoticeSection[] {
  const spa = s['business.name'];
  const dpoName = s['privacy.dpoName'].trim();
  const dpoEmail = s['privacy.dpoEmail'].trim() || s['business.email'];
  const contactPerson = dpoName || `the owner of ${spa}`;
  const hosting = s['privacy.hostingLocations'].trim() || 'outside the Philippines';

  return [
    {
      heading: 'Who holds your information',
      body: [
        `${spa}, at ${s['business.address']}, is responsible for the personal information described here. ` +
          `In the language of the Data Privacy Act of 2012 (Republic Act 10173) we are the personal information controller, ` +
          `which means the obligations below are ours and not something we can pass to a supplier.`,
        `For anything about your own information — to see it, correct it, or have it erased — write to ${contactPerson} at ${dpoEmail}, ` +
          `or speak to whoever is at the desk and ask them to pass it on. You will not be charged for asking.`,
      ],
    },

    {
      heading: 'What we collect, and why',
      body: [
        `We ask for two different kinds of thing, and it is worth being clear about which is which.`,
        `The first is how to reach you and who you are: your name, mobile number, email address, birthday, and the city and ` +
          `barangay you live in. We use it to hold your booking, to send your confirmation and reminders, and so the desk ` +
          `knows who is arriving. Your birthday is used for the birthday greeting and any birthday perk your membership carries; ` +
          `if you would rather not receive those, say so and we will stop.`,
        `The second is your health information, which is treated separately below.`,
        `We also record what you booked and what you paid, because we are required to. If you claim a PWD or Senior Citizen ` +
          `discount we record the ID number you present, because the Bureau of Internal Revenue requires it to appear on the receipt ` +
          `as the evidence for that discount. If you pay a reservation fee by bank transfer or GCash and send us a screenshot, ` +
          `we hold that image only until we have checked the payment against it.`,
      ],
    },

    {
      heading: 'Your health information',
      body: [
        `The intake form asks about conditions such as high blood pressure, heart conditions, diabetes, pregnancy, recent surgery, ` +
          `skin conditions, allergies and medication. Under the Data Privacy Act this is sensitive personal information, and it is ` +
          `handled more carefully than the rest.`,
        `We ask for one reason: some treatments are unsafe for some conditions, and a therapist who has not been told cannot ` +
          `work around what they do not know. It is not used for marketing, it is never sold, and it is not shared with anyone ` +
          `outside the spa.`,
        `Inside the spa it is available to the staff caring for you — including the receptionist taking your booking, because ` +
          `that is the moment an allergy or a pregnancy has to change what is booked and with whom. Every time a member of ` +
          `staff opens your health record, the system records who opened it and when, and that record cannot be edited or ` +
          `deleted by anyone, including the owner.`,
        `You may decline to answer. We will still treat you, but a therapist may decline a specific treatment if they cannot ` +
          `establish that it is safe, and that is a judgement we would rather make out loud than by guessing.`,
      ],
    },

    {
      heading: 'Who else sees it',
      body: [
        `We do not sell your information and we do not share it for anyone else's marketing. A small number of suppliers ` +
          `process parts of it on our behalf, only as far as the job requires:`,
      ],
      bullets: [
        `Our payment provider, for online reservation fees. Your card details go to them directly and never reach our system — ` +
          `we see only that a payment succeeded, and for how much.`,
        `Our email provider, to deliver your booking confirmation and reminders.`,
        `Our SMS provider, where text reminders are switched on.`,
        `The companies hosting our database and application, who store it but do not use it.`,
        `Our accountant, examiners from the Bureau of Internal Revenue, and anyone else the law obliges us to show records to. ` +
          `Health information is excluded from every report produced for tax or accounting purposes.`,
      ],
    },

    {
      heading: 'Where it is kept',
      body: [
        `Our systems are hosted in ${hosting}. That means your information is processed outside the Philippines, which the ` +
          `Data Privacy Act permits — but it does not reduce what we owe you. We remain answerable for it wherever it sits, ` +
          `and we choose suppliers who are contractually bound to protect it to the same standard.`,
      ],
    },

    {
      heading: 'How long we keep it',
      body: [
        `Different things have different reasons to exist, so they have different lifespans.`,
      ],
      bullets: [
        `Receipts, sales and accounting records: ten years, because the Bureau of Internal Revenue requires it. These cannot ` +
          `be deleted on request, and we explain why below.`,
        `Your contact details and health answers: for as long as you are a client of the spa, and until you ask us to erase them.`,
        `Records of messages we sent you: ${plural(s['privacy.emailLogRetentionDays'])}, then deleted automatically.`,
        `Staff sign-in records, kept to investigate misuse of the system: ${plural(s['privacy.loginLogRetentionDays'])}, then deleted automatically.`,
        `The record of which staff member opened which health file: kept, and never deleted. It exists to protect you, and a ` +
          `log that can be cleared protects nobody.`,
      ],
    },

    {
      heading: 'Your rights',
      body: [
        `The Data Privacy Act gives you rights over your own information, and we have built the system so that we can actually ` +
          `honour them rather than merely list them here.`,
      ],
      bullets: [
        `To be told what we hold about you, and to be given a copy.`,
        `To have anything wrong corrected.`,
        `To have your information erased. We will remove your health answers, contact details, address, notes and any payment ` +
          `screenshots. We cannot remove your paid receipts, because the law requires us to keep them for ten years and a ` +
          `receipt with its customer removed is a gap that reads to an examiner as a concealed sale. What remains does not ` +
          `name you.`,
        `To object to us using your information for reminders, greetings or offers, without giving a reason and without ` +
          `affecting your treatment.`,
        `To withdraw a consent you have given.`,
        `To complain to the National Privacy Commission at privacy.gov.ph if you think we have got this wrong. We would much ` +
          `rather you told us first, but you are not obliged to.`,
      ],
    },

    {
      heading: 'How we protect it',
      body: [
        `Staff sign in with their own accounts and see only what their role requires. Passwords are stored hashed, never in ` +
          `readable form. Repeated failed sign-ins are locked out. Changes to records are written to a log that cannot be ` +
          `edited or deleted, and opening a health record is one of the things written there.`,
        `Backups are encrypted, so a copied file is not a readable copy of your health record. Reports that staff export for ` +
          `everyday work — client lists, sales summaries — deliberately exclude health information entirely.`,
        `None of this makes a system impossible to breach, and we would rather say so than imply otherwise. If a breach ever ` +
          `puts your information at real risk, we will tell you and the National Privacy Commission, as the law requires.`,
      ],
    },

    {
      heading: 'Children',
      body: [
        `Where a client is under 18, we ask that a parent or guardian gives consent and completes the health questions with ` +
          `them. We do not knowingly collect information from a child without it.`,
      ],
    },

    {
      heading: 'Changes to this notice',
      body: [
        `If we change how we handle your information we will update this page and the date at the top of it. Where a change ` +
          `is significant, we will ask for your consent again rather than assume the old one still covers it.`,
      ],
    },
  ];
}
