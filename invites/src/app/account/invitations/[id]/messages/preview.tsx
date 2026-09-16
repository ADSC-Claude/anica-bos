import { MESSAGE_VARS } from '@/lib/messages';

/**
 * What the guest actually receives.
 *
 * Both previews are filled in with one made-up guest rather than left as
 * {{guestName}}, because a couple approving their own words needs to read the
 * sentence, not the template — the commonest mistake in a message like this is
 * a name that lands in the middle of a comma splice, and you cannot see that
 * in a template.
 */

/** The stand-in guest every preview is addressed to. */
export const SAMPLE = {
  guestName: 'Tita Baby',
  fullName: 'Beatriz Almeda',
  email: 'tita.baby@example.com',
};

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

/** The variables a preview fills, for the hint under the editor. */
export function sampleVars(hosts: string, eventDate: string, link: string): Record<string, string> {
  return { guestName: SAMPLE.guestName, hosts, eventDate, link };
}

/**
 * A text on a lock screen.
 *
 * The sender name is shown at the size a phone shows it and in the case a
 * phone shows it, because that is the single thing a guest reads before
 * deciding whether the message is worth opening — and it is the one part the
 * couple cannot change.
 */
export function SmsPreview({ sender, body, segments }: { sender: string; body: string; segments: number }) {
  return (
    <div className="rounded-2xl bg-[color:var(--color-ink-900,#1c1917)] p-3 text-white shadow-inner">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold tracking-wider text-white/70">{sender.toUpperCase()}</span>
        <span className="text-[10px] text-white/40">now</span>
      </div>
      <p className="max-w-sm rounded-2xl rounded-tl-sm bg-[#2b6cee] px-3.5 py-2.5 text-[13px] leading-snug whitespace-pre-wrap">
        {body}
      </p>
      <p className="mt-2 text-[10px] text-white/40">
        {body.length} characters · {segments} text{segments === 1 ? '' : 's'} per guest
        {segments > 1 ? ' — every guest is charged for both' : ''}
      </p>
    </div>
  );
}

/** The same message in an inbox, where it has a subject line and room. */
export function EmailPreview({ from, subject, body }: { from: string; subject: string; body: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--color-ink-200,#e7e5e4)] bg-white">
      <div className="border-b border-[color:var(--color-ink-200,#e7e5e4)] bg-[color:var(--color-ink-50,#fafaf9)] px-4 py-3">
        <p className="text-[13px] font-semibold">{subject}</p>
        <p className="mt-0.5 text-[11px] text-[color:var(--color-ink-500)]">
          {from} <span className="text-[color:var(--color-ink-400,#a8a29e)]">to {SAMPLE.email}</span>
        </p>
      </div>
      <p className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  );
}

/** The list of things a couple may drop into a message, under the editor. */
export function VariableHints() {
  return (
    <p className="text-[11px] text-[color:var(--color-ink-500)]">
      You can use:{' '}
      {MESSAGE_VARS.map((v, i) => (
        <span key={v.key}>
          {i > 0 ? ' · ' : ''}
          <code className="rounded bg-[color:var(--color-ink-100,#f5f5f4)] px-1 py-0.5 font-mono text-[10px]">{`{{${v.key}}}`}</code>{' '}
          {v.label.toLowerCase()}
        </span>
      ))}
    </p>
  );
}
