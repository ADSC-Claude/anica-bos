import 'server-only';
import { prisma } from './db';
import { getSettings } from './settings';
import { appUrl } from './app-url';

/**
 * Transactional email. If RESEND_API_KEY is unset the message is logged to the
 * console and recorded in EmailLog with status "logged" — the whole booking
 * flow therefore works in development without any third-party account.
 */

export type TemplateKey =
  | 'booking_received'
  | 'booking_confirmed'
  | 'booking_rejected'
  | 'membership_expiring'
  | 'birthday_greeting'
  | 'permit_expiry';

export const DEFAULT_TEMPLATES: Record<TemplateKey, { subject: string; body: string }> = {
  booking_received: {
    subject: 'We received your booking — {{reference}}',
    body: `Hi {{clientName}},

Thank you for booking with {{businessName}}!

  Reference : {{reference}}
  Service   : {{services}}
  Date/Time : {{when}}
  Therapist : {{therapist}}

To hold your slot we ask for a reservation fee of {{deposit}} ({{depositPercent}}% of the service price). {{depositInstructions}}

Your booking stays PENDING until the reservation fee is received, and expires automatically after {{expiryMinutes}} minutes if unpaid. The reservation fee is deducted from your final bill.

See you soon!
{{businessName}} • {{businessContact}}`,
  },
  booking_confirmed: {
    subject: 'Your booking is confirmed — {{reference}}',
    body: `Hi {{clientName}},

Your reservation fee of {{deposit}} has been received and your booking is CONFIRMED.

  Reference : {{reference}}
  Service   : {{services}}
  Date/Time : {{when}}
  Therapist : {{therapist}}
  Room/Bed  : {{resource}}

The reservation fee will be deducted from your final bill. Please arrive 10 minutes early.

Need to change anything? Reply to this email or call {{businessContact}}.

{{businessName}}
{{businessAddress}}`,
  },
  booking_rejected: {
    subject: 'About your booking — {{reference}}',
    body: `Hi {{clientName}},

Unfortunately we could not confirm your booking {{reference}} for {{when}}.

Reason: {{reason}}

Nothing has been charged. You're very welcome to book again at {{appUrl}}, or call us at {{businessContact}} and we'll help you find a slot.

{{businessName}}`,
  },
  membership_expiring: {
    subject: 'Your {{businessName}} membership expires on {{expiryDate}}',
    body: `Hi {{clientName}},

A friendly reminder that your {{packageName}} membership expires on {{expiryDate}} — about a month from now.

Renew on your next visit to keep your member discount, loyalty perks, and your free birthday-month massage.

Thank you for being part of {{businessName}}!
{{businessContact}}`,
  },
  birthday_greeting: {
    subject: 'Happy Birthday, {{clientName}}! 🎉',
    body: `Happy birthday, {{clientName}}!

Everyone at {{businessName}} wishes you a wonderful year ahead.

{{promoText}}

Book anytime at {{appUrl}} or call {{businessContact}}. We'd love to pamper you this month.

{{businessName}}`,
  },
  permit_expiry: {
    subject: '[Action needed] {{permitName}} expires in {{daysLeft}} days',
    body: `{{permitName}} ({{agency}}) — reference {{refNumber}} — expires on {{expiryDate}}, {{daysLeft}} day(s) from now.

Open the compliance tracker to update it: {{appUrl}}/portal/settings/permits`,
  },
};

function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : '',
  );
}

export async function getTemplate(key: TemplateKey) {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [`email.template.${key}.subject`, `email.template.${key}.body`] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value as string]));
  return {
    subject: map[`email.template.${key}.subject`] ?? DEFAULT_TEMPLATES[key].subject,
    body: map[`email.template.${key}.body`] ?? DEFAULT_TEMPLATES[key].body,
  };
}

export async function sendTemplateEmail(opts: {
  to: string;
  template: TemplateKey;
  vars: Record<string, string | number>;
  clientId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const settings = await getSettings();
  if (!settings['email.enabled']) return { ok: false, error: 'Email disabled in Settings.' };
  if (!opts.to) return { ok: false, error: 'No recipient address.' };

  const tpl = await getTemplate(opts.template);
  const baseVars = {
    businessName: settings['business.name'],
    businessContact: settings['business.contact'],
    businessAddress: settings['business.address'],
    appUrl: appUrl(),
    ...opts.vars,
  };
  const subject = render(tpl.subject, baseVars);
  const text = render(tpl.body, baseVars);

  return sendRaw({ to: opts.to, subject, text, template: opts.template, clientId: opts.clientId });
}

export async function sendRaw(opts: {
  to: string;
  subject: string;
  text: string;
  template?: string;
  clientId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'ANICA Wellness Spa <onboarding@resend.dev>';

  if (!apiKey) {
    console.info(
      `\n──── EMAIL (not sent — RESEND_API_KEY unset) ────\nTo: ${opts.to}\nSubject: ${opts.subject}\n\n${opts.text}\n────────────────────────────────────────────────\n`,
    );
    await logEmail(opts, 'logged', '');
    return { ok: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      await logEmail(opts, 'failed', detail.slice(0, 500));
      return { ok: false, error: detail };
    }
    await logEmail(opts, 'sent', '');
    return { ok: true };
  } catch (err) {
    const message = String((err as Error).message ?? err);
    await logEmail(opts, 'failed', message.slice(0, 500));
    return { ok: false, error: message };
  }
}

async function logEmail(
  opts: { to: string; subject: string; template?: string; clientId?: string | null },
  status: string,
  error: string,
) {
  await prisma.emailLog.create({
    data: {
      to: opts.to,
      subject: opts.subject,
      template: opts.template ?? '',
      clientId: opts.clientId ?? null,
      status,
      error,
    },
  });
}
