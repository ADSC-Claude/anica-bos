import type { SectionKey } from './sections';
import { addDays, formatDate } from './datetime';

/**
 * How far a couple has come, and how long they have. Each section is marked
 * Done by the couple when they have filled it; our team starts on the
 * invitation only once every section they have is marked Done, and the
 * builder says so. Three weeks before the event the invitation closes to
 * their changes and passes to our team for the final touches, which are done
 * by two weeks before — the last week is kept clear. Pure functions, so the
 * page, the server and the tests share one reading of the dates.
 */
export type Progress = {
  done?: string[];
  completedAt?: string;
  /** The sections the customer agreed to publish empty, and when they agreed. */
  sentBlank?: string[];
  sentBlankAt?: string;
};

export const CLOSE_DAYS = 21;
export const FINAL_DAYS = 14;

export type ChangeWindow = { closesAt: Date; finalAt: Date; closed: boolean };

/** When changes close and when the final touches are due, for an event on this date; nothing for an event with no date yet. */
export function changeWindow(eventAt: Date | null | undefined, now = new Date()): ChangeWindow | null {
  if (!eventAt || Number.isNaN(eventAt.getTime())) return null;
  const closesAt = addDays(eventAt, -CLOSE_DAYS);
  const finalAt = addDays(eventAt, -FINAL_DAYS);
  return { closesAt, finalAt, closed: now.getTime() >= closesAt.getTime() };
}

/**
 * The parts a customer keeps after publishing, and inside the window: the
 * switches that run the day — whether guests can write in the guestbook or
 * add to the album, and what the RSVP form asks. None of it is design work,
 * and all of it is wanted exactly when everything else is closed: the album
 * is switched on at the reception, not three weeks before it, and the
 * reception is inside the window. Everything else on a live page is ours
 * to change, which is what "message us" means.
 */
export const LIVE_SECTIONS: ReadonlySet<SectionKey> = new Set<SectionKey>(['guestbook', 'photos', 'rsvp']);
export function liveEditable(key: SectionKey): boolean {
  return LIVE_SECTIONS.has(key);
}

/** The two reasons a customer's save is refused, in the words every page and the server use. */
export const LIVE_LOCK = 'Your invitation is already live, so changes to it are ours to make. Message us on Messenger and we will sort it out.';
export function windowLock(w: ChangeWindow): string {
  return `Changes closed on ${formatDate(w.closesAt)}, three weeks before your event. Your invitation is with our team for the final touches, done by ${formatDate(w.finalAt)}. Message us for anything urgent.`;
}

/**
 * Why a customer cannot save this part right now — or nothing, when they can.
 * The same reading saveSection enforces, so a page never offers a control
 * that the save would refuse, and never withholds one the save would take.
 */
export function whyLocked(inv: { status: string; eventAt: Date | null }, key: SectionKey, now = new Date()): string | undefined {
  if (liveEditable(key)) return undefined;
  if (inv.status === 'PUBLISHED') return LIVE_LOCK;
  const w = changeWindow(inv.eventAt, now);
  return w?.closed ? windowLock(w) : undefined;
}

/** The sections marked Done, as stored. */
export function doneSections(progress: Progress | undefined): SectionKey[] {
  return (progress?.done ?? []).filter((k): k is SectionKey => typeof k === 'string') as SectionKey[];
}

/** The progress with one section marked Done or reopened. */
export function withDone(progress: Progress | undefined, key: SectionKey, done: boolean): Progress {
  const current = doneSections(progress).filter((k) => k !== key);
  return { ...(progress ?? {}), done: done ? [...current, key] : current };
}

/**
 * The schedule, counted back from the day the invitation goes out.
 *
 * A customer thinks in one date: the day they send the link to their guests.
 * We work back from it. The form has to be final before anybody can start,
 * a first version takes about a week, and the fortnight after that is for the
 * revisions that actually make it theirs. Squeeze that fortnight and the
 * revisions are the thing that gets squeezed, so the form is asked for three
 * weeks ahead at the latest and a month ahead by preference.
 *
 * Calendar days, not working days: a customer counts on a calendar, and a
 * promise made in working days is a promise they have to translate.
 */
/**
 * What we tell a customer to plan against: the far end of the build estimate,
 * not the near one. A date that turns out early is a good surprise; one that
 * turns out late is a promise we broke. Keep it in step with
 * dfy.turnaroundDaysMax — a test holds the two together.
 */
export const PROCESSING_DAYS = 10;
/** The latest a final form can reach us and still leave room for revisions. */
export const FINAL_FORM_DAYS = 21;
/** What we ask for by preference, so nothing is rushed. */
export const COMFORTABLE_DAYS = 30;

export type Schedule = {
  sendOut: Date;
  /** The latest the final form should reach us. */
  finalBy: Date;
  /** The date we would rather have it by. */
  comfortableBy: Date;
  /** When a first version would be ready if the form were final today. */
  readyIfFinalisedNow: Date;
  daysToSendOut: number;
  /** The form is due within the week, or is already due. */
  tight: boolean;
  /** There is no longer room for the week of work plus revisions. */
  late: boolean;
};

export function scheduleAdvice(sendOut: Date | null | undefined, now = new Date()): Schedule | null {
  if (!sendOut || Number.isNaN(sendOut.getTime())) return null;
  const day = 24 * 60 * 60 * 1000;
  const daysToSendOut = Math.ceil((sendOut.getTime() - now.getTime()) / day);
  const finalBy = addDays(sendOut, -FINAL_FORM_DAYS);
  return {
    sendOut,
    finalBy,
    comfortableBy: addDays(sendOut, -COMFORTABLE_DAYS),
    readyIfFinalisedNow: addDays(now, PROCESSING_DAYS),
    daysToSendOut,
    tight: daysToSendOut <= FINAL_FORM_DAYS + 7,
    late: daysToSendOut < PROCESSING_DAYS,
  };
}

/** True once every section the couple has is marked Done. */
export function formComplete(progress: Progress | undefined, sections: SectionKey[]): boolean {
  const done = new Set(doneSections(progress));
  return sections.length > 0 && sections.every((k) => done.has(k));
}
