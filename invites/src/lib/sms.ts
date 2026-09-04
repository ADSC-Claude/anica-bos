import 'server-only';
import { getSettings } from './settings';

/**
 * Text messages through Semaphore, over one `fetch`. No SDK, same shape as
 * email.ts — and, like it, without SEMAPHORE_API_KEY the message is printed to
 * the console and reported as logged, so the whole reminder chain can be
 * exercised on a fresh clone with no account and no credits spent.
 *
 * Semaphore is a Philippine gateway and wants Philippine numbers. Guests type
 * theirs every which way — 0917…, +63 917…, 63917…, with spaces and dashes —
 * so the number is normalised here rather than at the fifteen places a phone
 * number can be entered.
 */

export type SmsResult = { ok: boolean; status: 'sent' | 'logged' | 'failed'; error?: string };

/**
 * A Philippine mobile number as Semaphore wants it: 639XXXXXXXXX.
 * Returns null for anything that is not one — a landline, a foreign number, a
 * typo — because a rejected send still costs a request and tells the sender
 * nothing useful.
 */
export function phMobile(raw: string): string | null {
  const digits = (raw ?? '').replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (!digits) return null;

  // 09XXXXXXXXX (11) → 639XXXXXXXXX
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  // 639XXXXXXXXX (12)
  if (/^639\d{9}$/.test(digits)) return digits;
  // 9XXXXXXXXX (10), typed without the leading zero
  if (/^9\d{9}$/.test(digits)) return `63${digits}`;
  return null;
}

/** How a number is shown back to the sender: 0917 123 4567. */
export function formatPhMobile(normalised: string): string {
  const local = `0${normalised.slice(2)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/**
 * The GSM 03.38 basic set, plus the extension characters that cost two septets
 * each. Everything a reminder normally contains is in here — including ñ and
 * the peso sign — which is why a plain Filipino message is the cheap kind.
 */
const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€';

/**
 * What a message actually costs, in credits.
 *
 * A message of ordinary text is one credit up to 160 characters and a further
 * one per 153 after that. A single emoji — or any other character outside the
 * GSM alphabet — forces the whole message into UCS-2, where the allowance
 * collapses to 70 and 67. That cliff is the entire reason this is computed
 * rather than estimated: a sender who drops a 🎉 into the template turns a
 * one-credit blast into a three-credit one, and should see it before sending
 * it two hundred times.
 */
export function creditsFor(text: string): number {
  const characters = [...text];
  if (characters.length === 0) return 0;

  const unicode = characters.some((c) => !GSM7.includes(c) && !GSM7_EXTENDED.includes(c));
  if (unicode) {
    // UCS-2 is billed per 16-bit unit, so an emoji outside the BMP counts twice.
    const units = text.length;
    return units <= 70 ? 1 : Math.ceil(units / 67);
  }

  const septets = characters.reduce((n, c) => n + (GSM7_EXTENDED.includes(c) ? 2 : 1), 0);
  return septets <= 160 ? 1 : Math.ceil(septets / 153);
}

export async function sendSms(opts: { to: string; text: string }): Promise<SmsResult> {
  const number = phMobile(opts.to);
  if (!number) return { ok: false, status: 'failed', error: 'Not a Philippine mobile number.' };
  if (!opts.text.trim()) return { ok: false, status: 'failed', error: 'Empty message.' };

  const apiKey = process.env.SEMAPHORE_API_KEY;
  if (!apiKey) {
    console.info(
      `\n──── SMS (not sent — SEMAPHORE_API_KEY unset) ────\nTo: +${number}\n\n${opts.text}\n─────────────────────────────────────────────────\n`,
    );
    return { ok: true, status: 'logged' };
  }

  const settings = await getSettings();
  const senderName = settings['sms.senderName']?.trim();

  try {
    const res = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: apiKey,
        number,
        message: opts.text,
        ...(senderName ? { sendername: senderName } : {}),
      }),
    });
    if (!res.ok) {
      return { ok: false, status: 'failed', error: (await res.text()).slice(0, 500) };
    }
    // Semaphore answers with an array of accepted messages. An empty array is
    // a rejection dressed as a 200, so it is not treated as a success.
    const body = (await res.json()) as unknown;
    if (Array.isArray(body) && body.length === 0) {
      return { ok: false, status: 'failed', error: 'Semaphore accepted nothing.' };
    }
    return { ok: true, status: 'sent' };
  } catch (err) {
    return { ok: false, status: 'failed', error: String((err as Error).message ?? err).slice(0, 500) };
  }
}
