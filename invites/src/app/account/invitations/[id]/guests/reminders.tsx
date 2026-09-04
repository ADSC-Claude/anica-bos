'use client';

import { useState, useTransition } from 'react';
import { previewRemindersAction, sendRemindersAction } from '@/app/account/actions';

type Plan = {
  count: number;
  credits: number;
  sample: string;
  skipped: { name: string; reason: 'answered' | 'no number' | 'texted today' }[];
};

const REASONS: Record<Plan['skipped'][number]['reason'], string> = {
  answered: 'already answered',
  'no number': 'no mobile number',
  'texted today': 'texted in the last 24 hours',
};

/**
 * A blast is spending money on someone else's phone, so it is deliberately two
 * steps: work out who and what it costs, show the message that will actually
 * arrive, and only then send.
 */
export function Reminders({ invitationId, live }: { invitationId: string; live: boolean }) {
  const [pending, start] = useTransition();
  const [everyone, setEveryone] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  function preview(next = everyone) {
    start(async () => {
      setError('');
      setResult('');
      const r = await previewRemindersAction(invitationId, next);
      if (!r.ok) setError(r.error ?? 'Something went wrong.');
      else setPlan(r.data as Plan);
    });
  }

  function send() {
    start(async () => {
      setError('');
      const r = await sendRemindersAction(invitationId, everyone);
      if (!r.ok) {
        setError(r.error ?? 'Something went wrong.');
        return;
      }
      const o = r.data as { sent: number; logged: number; failed: number };
      setPlan(null);
      setResult(
        [
          o.sent ? `${o.sent} sent` : '',
          o.logged ? `${o.logged} logged to the console (no SMS key set)` : '',
          o.failed ? `${o.failed} failed` : '',
        ]
          .filter(Boolean)
          .join(', ') || 'Nothing to send.',
      );
    });
  }

  const grouped = plan
    ? (['answered', 'no number', 'texted today'] as const)
        .map((reason) => ({ reason, n: plan.skipped.filter((s) => s.reason === reason).length }))
        .filter((g) => g.n > 0)
    : [];

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Text an RSVP reminder</h2>
          <p className="text-sm text-[color:var(--color-ink-500)]">
            Each guest gets their own link. Anyone texted in the last 24 hours is left alone.
            {!live && ' No SMS key is configured, so messages will be written to the server log instead of sent.'}
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
          {pending ? 'Checking…' : 'See who would be texted'}
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            <strong>{plan.count}</strong> {plan.count === 1 ? 'guest' : 'guests'} would be texted
            {plan.credits > 0 && <> · {plan.credits} {plan.credits === 1 ? 'credit' : 'credits'}</>}
            {grouped.length > 0 && (
              <> · skipping {grouped.map((g) => `${g.n} ${REASONS[g.reason]}`).join(', ')}</>
            )}
          </p>
          {plan.sample && (
            <blockquote className="rounded-xl bg-[color:var(--color-sand-100)] p-3 text-sm">
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
