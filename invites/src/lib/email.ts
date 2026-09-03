import 'server-only';
import { getSettings } from './settings';
import { appUrl } from './app-url';

/**
 * Transactional email through Resend, over one `fetch`. No SDK.
 *
 * Without RESEND_API_KEY the message is printed to the console and reported as
 * logged, so a fresh clone exercises the whole order chain with no account
 * anywhere.
 */

export type SendResult = { ok: boolean; status: 'sent' | 'logged' | 'failed'; error?: string };

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
  const settings = await getSettings();
  if (!opts.to.trim()) return { ok: false, status: 'failed', error: 'No recipient address.' };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || `${settings['business.name']} <onboarding@resend.dev>`;
  const replyTo = opts.replyTo || settings['business.email'] || undefined;

  if (!apiKey) {
    console.info(
      `\n──── EMAIL (not sent — RESEND_API_KEY unset) ────\nTo: ${opts.to}\nSubject: ${opts.subject}\n\n${opts.text}\n────────────────────────────────────────────────\n`,
    );
    return { ok: true, status: 'logged' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, status: 'failed', error: detail.slice(0, 500) };
    }
    return { ok: true, status: 'sent' };
  } catch (err) {
    return { ok: false, status: 'failed', error: String((err as Error).message ?? err).slice(0, 500) };
  }
}

/** `{{placeholder}}` substitution. An unknown key renders as empty, not as itself. */
export function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : '',
  );
}

export async function baseVars(): Promise<Record<string, string>> {
  const s = await getSettings();
  return {
    businessName: s['business.name'],
    businessEmail: s['business.email'],
    messenger: s['contact.messenger'],
    viber: s['contact.viber'],
    appUrl: appUrl(),
  };
}
