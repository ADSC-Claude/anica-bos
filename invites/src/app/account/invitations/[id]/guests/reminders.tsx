'use client';

import { useState, useTransition } from 'react';
import {
  previewRemindersAction,
  sendRemindersAction,
  previewEmailRemindersAction,
  sendEmailRemindersAction,
} from '@/app/account/actions';

/**
 * The two blasts, which are the same two steps in different clothes: work out
 * who and what it would cost, show the message that will actually arrive, and
 * only then send. One component, because the difference between them is words
 * and a price — and a text blast and an e-mail blast that behaved differently
 * would be a worse surprise than either.
 */

type Skip = { name: string; reason: string };
type Plan = { count: number; credits?: number; sample: string; skipped: Skip[] };

/** What a guest is not being sent to, in the words of the channel they are not being sent by. */
const REASONS: Record<string, string> = {
  answered: 'already answered',
  'no number': 'no mobile number',
  'texted today': 'texted in the last 24 hours',
  'no address': 'no e-mail address',
  'e-mailed today': 'e-mailed in the last 24 hours',
};

type Channel = {
  title: string;
  blurb: string;
  /** What is missing when nothing can be sent at all. */
  keyless: string;
  verb: string;
  reasons: readonly string[];
  preview: (id: string, everyone: boolean) => Promise<{ ok: boolean; error?: string; data?: unknown }>;
  send: (id: string, everyone: boolean) => Promise<{ ok: boolean; error?: string; data?: unknown }>;
};

const CHANNELS: Record<'sms' | 'email', Channel> = {
  sms: {
    title: 'Text an RSVP reminder',
    blurb: 'Each guest gets their own link. Anyone texted in the last 24 hours is left alone.',
    keyless: 'No SMS key is configured, so messages will be written to the server log instead of sent.',
    verb: 'texted',
    reasons: ['answered', 'no number', 'texted today'],
    preview: previewRemindersAction,
    send: sendRemindersAction,
  },
  email: {
    title: 'E-mail an RSVP reminder',
    blurb:
      'Each guest gets their own link. Anyone e-mailed in the last 24 hours is left alone, and it reaches the guests abroad that a text cannot.',
    keyless: 'No e-mail key is configured, so messages will be written to the server log instead of sent.',
    verb: 'e-mailed',
    reasons: ['answered', 'no address', 'e-mailed today'],
    preview: previewEmailRemindersAction,
    send: sendEmailRemindersAction,
  },
};

export function Reminders({ invitationId, live, channel = 'sms' }: { invitationId: string; live: boolean; channel?: 'sms' | 'email' }) {
  const c = CHANNELS[channel];
  const [pending, start] = useTransition();
  const [everyone, setEveryone] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  function preview(next = everyone) {
    start(async () => {
      setError('');
      setResult('');
      const r = await c.preview(invitationId, next);
      if (!r.ok) setError(r.error ?? 'Something went wrong.');
      else setPlan(r.data as Plan);
    });
  }

  function send() {
    start(async () => {
      setError('');
      const r = await c.send(invitationId, everyone);
      if (!r.ok) {
        setError(r.error ?? 'Something went wrong.');
        return;
      }
      const o = r.data as { sent: number; logged: number; failed: number };
      setPlan(null);
      setResult(
        [
          o.sent ? `${o.sent} sent` : '',
          o.logged ? `${o.logged} logged to the console (no key set)` : '',
          o.failed ? `${o.failed} failed` : '',
        ]
          .filter(Boolean)
          .join(', ') || 'Nothing to send.',
      );
    });
  }

  const grouped = plan
    ? c.reasons
        .map((reason) => ({ reason, n: plan.skipped.filter((s) => s.reason === reason).length }))
        .filter((g) => g.n > 0)
    : [];

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">{c.title}</h2>
          <p className="text-sm text-[color:var(--color-ink-500)]">
            {c.blurb}
            {!live && ` ${c.keyless}`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={everyone}
            onChange={(e) => {
              setEveryone(e.target.checked);
              setPlan(null);
              if (plan) preview(e.target.checked);
            }}
          />
          Include guests who already answered
        </label>
      </div>

      {error && <p role="alert" className="rounded-lg bg-[#fbe9e7] p-2 text-sm text-[#8f1d17]">{error}</p>}
      {result && <p className="rounded-lg bg-[color:var(--color-sand-100)] p-2 text-sm">{result}</p>}

      {!plan ? (
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => preview()}>
          {pending ? 'Checking…' : `See who would be ${c.verb}`}
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            <strong>{plan.count}</strong> {plan.count === 1 ? 'guest' : 'guests'} would be {c.verb}
            {/* Only a text has a price. An e-mail says nothing rather than "0 credits",
                which would read as a charge that happened to come to nothing. */}
            {plan.credits ? <> · {plan.credits} {plan.credits === 1 ? 'credit' : 'credits'}</> : null}
            {grouped.length > 0 && (
              <> · skipping {grouped.map((g) => `${g.n} ${REASONS[g.reason] ?? g.reason}`).join(', ')}</>
            )}
          </p>
          {plan.sample && (
            <blockquote className="whitespace-pre-line rounded-xl bg-[color:var(--color-sand-100)] p-3 text-sm">
              {plan.sample}
            </blockquote>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={pending || plan.count === 0} onClick={send}>
              {pending ? 'Sending…' : `Send ${plan.count || ''}`.trim()}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setPlan(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
