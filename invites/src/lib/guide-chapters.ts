import type { TabKey } from './account-tabs';

/**
 * The Guide: a chapter per tab, in the strip's order, in the customer's
 * words. Each chapter says what the tab is for, what to do on it and what
 * happens next; a chapter whose tab the package does not include still
 * shows, with the line that says so, because a customer who cannot see
 * that a thing exists cannot want it. Then the questions we are asked most.
 */
export type Chapter = {
  key: string;
  title: string;
  /** The tab this chapter is about, for the Open button and the Upgrade line. */
  tab?: TabKey;
  body: string[];
  /** Short do-this lines under the paragraphs. */
  steps?: string[];
};

export const CHAPTERS: Chapter[] = [
  {
    key: 'start',
    title: 'Meet your dashboard',
    body: [
      'Everything about your invitation lives under one strip of tabs, one tab per tool. Invitation is where you fill in your details; Share is your link and QR code; Guest list, RSVP responses, Check-in, Messages, Guestbook and Guest photos are the tools that run once your guests have the link; Link & design is the address, the privacy and the colours. A tab with an Upgrade pill is in a bigger package — it stays in the strip so you can see what is there.',
      'On the Invitation tab the screen is in two halves: on the left you fill in, on the right you see your real page on a phone, exactly as a guest will. Every change saves by itself — there is no save button to forget — and the phone catches up a moment later, at the part you are working on.',
      'The Get started list at the top of the form is the plan: six lines, ticked by your invitation as you fill it in. Follow them down and you are done. This guide follows the same order.',
    ],
    steps: ['Press Show me around on the Get started list for a two-minute walk through the screen.'],
  },
  {
    key: 'invitation',
    title: 'Fill in your invitation',
    tab: 'invitation',
    body: [
      'Your invitation is made of parts — Cover, Our Story, The Invitation, the entourage, the photos, the venue, the dress code and so on — listed as numbered steps in the order they appear on your page. Open a part, fill in its boxes, and watch the phone on the right show your words where they land.',
      'Under most boxes a short line says what the box is for and where it shows. Some have examples: tap one and it goes into the box for you to edit. A counter appears when a box is getting full — it counts the room the page has, so nothing is cut off on a guest’s phone.',
      'When a part is finished, mark it done. Mark it done too when you are leaving it out on purpose — a couple with no story page to write simply does not have one, and the invitation is shorter for it. Once every part is marked done, our team knows your form is complete and starts on the final touches.',
      'Language & font style sits above the steps: the language the fixed words on the page speak (your own words stay as you typed them), and the set of fonts the page is written in.',
    ],
    steps: ['Start with the Cover: names, the date, the place and a photo.', 'Work down the steps; each one is one screen of your page.', 'Mark each part done — finished, or left out on purpose.'],
  },
  {
    key: 'photos',
    title: 'Your photos and words',
    tab: 'invitation',
    body: [
      'A portrait photo works best on a phone; the cover photo is also what shows when your link is pasted in a chat. Photos upload the moment you choose them. Where a design has a set number of frames — four polaroids on a christening, say — the form says how many it holds, and the first ones you add are the ones that show.',
      'The writings are yours: how you met, the proposal, a message from the parents, a dedication. Where a box is hard to start, an example sits under it. The headings and the small lines under them are the design’s own, written for your occasion, and change with the font style you choose.',
    ],
  },
  {
    key: 'share',
    title: 'Preview and publish',
    tab: 'share',
    body: [
      'Until you publish, only you can see your invitation — the Preview button at the top opens the real page in a new tab, and the phone beside the form shows it as you go. Send the link to nobody yet: it is a page only your account can open.',
      'When it looks right, the Share tab has the Publish button. It names anything that has to be in before the page can go out (the names and the date on the cover), and lists any parts you left empty so you can say, in one tick, that you meant to. Publishing gives you your link and your QR code straight away.',
      'Where our team is doing the typing-in for you, the Share tab is where your preview arrives: open it on your phone, then approve it or tell us what to change, round by round. We publish it the moment you approve.',
      'Once live, the same tab has every way to send it — copy the link, Messenger, Viber, WhatsApp, SMS — a card image with a QR for the tita who forwards pictures rather than links, a print view for a PDF, and the QR code on its own for a printed card or a tarpaulin.',
    ],
    steps: ['Open Preview and read the page top to bottom on your phone.', 'On the Share tab, press Publish.', 'Paste the link in your family chat — the cover photo and names show up as the preview.'],
  },
  {
    key: 'guests',
    title: 'Guest list and personal links',
    tab: 'guests',
    body: [
      'The guest list is the one part of an invitation nobody can write for you. The tab opens on the numbers, then the two ways to put a name on the list: Add a guest, one at a time — a name is all we need, a mobile number or e-mail lets you send them their link — or Import your list from Excel: download the blank list, fill it in, and upload it back; paste rows straight from a spreadsheet if that is quicker. A name, number or e-mail already on the list is skipped, and the notice says how many were.',
      'Every guest on the list gets a personal link of their own: it greets them by name, holds the seats you set aside for them, and shows their table once you have seated them. Send it from the row — Copy link, Viber, SMS — with a ready-made message. Guests who reply through a personal link are held to their seats; guests who reply through the general link pick their own number, and those replies come to you to settle.',
      'The reminders, under the list, go to everyone who has not answered: e-mail is free; texts are charged per message by the gateway, so ask us for a pack before you send one. You see exactly who would be sent to, and why anyone is skipped, before anything goes. Tables live on the Seating chart tab; the Table column here only says where each guest sits.',
    ],
    steps: ['Add your guests, or import the list.', 'Send each one their personal link.', 'Chase the quiet ones with a reminder when the deadline is near.'],
  },
  {
    key: 'rsvps',
    title: 'RSVP responses',
    tab: 'rsvps',
    body: [
      'Every reply, as it arrives, counted up: how many replied, how many seats are confirmed, how many cannot come, and the average party size. Under the numbers, attendance as bars, the meal choices and dietary notes where your package asks for them, and the messages your guests left, each one signed. The table below has every reply in full.',
      'A reply that came through the general link with more seats than you expected waits in Seats to settle — keep the number or trim it, and write to the guest in your own words from the same card. Close RSVP when the deadline has passed; the form on your page says so and stops taking replies.',
      'The headcount sheet prints on one page — who is coming, how many of each meal, a tick box beside every name — for the coordinator on the day. Everything exports to Excel.',
      'What guests see is on the same tab: the RSVP form on your page, in a phone, beside your RSVP questions as switches — how many are coming, who is coming with them, allergies, which group they belong to — with the reply-by date and a number they can text instead. Turn a question on and it is on the form at once. After a guest sends the form they see a thank-you on the page, and on the Luxury package each guest who accepts with an e-mail address gets a confirmation of their seats.',
    ],
  },
  {
    key: 'seating',
    title: 'Seating chart',
    tab: 'seating',
    body: [
      'Where everyone sits, one card per table. Add a table with the name the place cards will carry, how many chairs it has and its shape; every guest on your Guest list waits in the Unassigned list until you seat them. Drag a name onto a table, or pick it from the table’s Add guest list, and their table shows on their personal link — so a guest looking themselves up on the day finds their seat.',
      'The three numbers at the top keep count: how many tables, how many seats are taken, how many chairs are still empty. A guest takes the seats they confirmed once they reply, and the seats you set aside for them before that; a guest who cannot come frees their places and stays on the card, struck through, until you move them. A table with more people than chairs shows its count in red until somebody moves. The chart never closes: you can move a name the week of the event.',
    ],
    steps: ['Add your tables, named the way the place cards will read.', 'Drag each name from Unassigned onto its table, or pick it from the table’s list.', 'Search for a name when the room is full and you cannot see where they went.'],
  },
  {
    key: 'checkin',
    title: 'Check-in on the day',
    tab: 'checkin',
    body: [
      'Each personal link carries a QR code. At the door, scan a guest’s code with any camera app and paste the link here, or type a name — a companion’s name finds their party too. A scan counts the whole party in; if some of them did not come, correct the number beside them, and undo a mistake with one tap.',
      'The line at the top keeps the count: how many guests are in, out of how many, and how many parties.',
    ],
  },
  {
    key: 'messages',
    title: 'Messages to your guests',
    tab: 'messages',
    body: [
      'The five messages your guests can get — the confirmation when they reply, the reminders a week and a day before, the note on the morning, and the thank-you after — written for your occasion in a heartfelt or a formal voice. Read each one as a guest will, on a phone screen and in an inbox, and change any word you like.',
      'Nothing goes out until you say so. Reminders are sent from the Guest list tab; the scheduled ones run only where a messaging pack is part of your package.',
    ],
  },
  {
    key: 'guestbook',
    title: 'Guestbook',
    tab: 'guestbook',
    body: [
      'A wall of wishes on your page, written by your guests. Switch it on at the top of this tab, and choose whether you read each wish before it shows; the numbers say how many are on the wall and how many are waiting for you. Approve the wishes you want shown, and anything you delete is gone.',
    ],
  },
  {
    key: 'photos-tab',
    title: 'Guest photos',
    tab: 'photos',
    body: [
      'An album your guests fill during and after the day, straight from their phones — no app, no login. Switch it on at the top of this tab, and choose whether each photo waits for your approval. Approve what shows on your page, hide what you would rather not, and download everything in one file afterwards.',
    ],
  },
  {
    key: 'save-the-date',
    title: 'Save the Date',
    tab: 'saveTheDate',
    body: [
      'A second card on the same design, with a link of its own, for sending months ahead: your names, the date, a countdown, and “Invitation to follow”. It is a separate invitation in your account with its own Share tab; nothing you do on it spends the revisions of the full invitation. Send its link first, and the full invitation’s link when everything is in.',
    ],
  },
  {
    key: 'settings',
    title: 'Link & design',
    tab: 'settings',
    body: [
      'The address of your page (a custom one from the Standard package), who can open it — anyone with the link, or only people with a password — and the language the fixed words speak. Colours and fonts, day and night, the opening scene before the page, and the design itself: switching designs keeps everything you typed.',
    ],
  },
  {
    key: 'faq',
    title: 'Common questions',
    body: [
      'Can I change something after publishing? Small fixes are ours to make — message us on Messenger or Viber and we sort it out. Three weeks before your event the form closes to changes and passes to our team for the final touches, which are done two weeks before, so the last week is quiet.',
      'Where do my photos go? On the page, where the design has a place for them, and in your account. Extra photos you send us are kept with your invitation and used only if a page has room, or if you ask.',
      'What does a guest see? Exactly what the phone beside your form shows, from the opening scene down to the RSVP. Guests do not need an app or an account.',
      'What if a guest answers twice? Both replies show on RSVP responses; remove the one to drop. A guest with a personal link can update their answer and it replaces the old one.',
      'How long does my link last? Until a month after your event, by default — the date is printed beside your link on the Share tab. Ask us if you need it longer.',
      'Is my guest list private? Yes. Guest lists are personal data: we collect only what an invitation needs, never share them, and delete them on request, in line with the Data Privacy Act of 2012.',
    ],
  },
];
