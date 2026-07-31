'use client';

import { useActionState } from 'react';
import { addFeedbackAction, type FormState } from '../actions';

export function FeedbackForm({
  clientId,
  therapists,
}: {
  clientId: string;
  therapists: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(addFeedbackAction, {});

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="label">Rating</span>
          <select name="rating" className="select" defaultValue="5">
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {'★'.repeat(n)} ({n})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Therapist</span>
          <select name="employeeId" className="select" defaultValue="">
            <option value="">— not specified —</option>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Comment</span>
        <input name="comment" className="input" placeholder="What did the client say?" />
      </label>
      <label className="flex items-start gap-2 text-sm text-cocoa-700">
        <input type="checkbox" name="showOnLanding" className="mt-0.5 h-5 w-5 accent-[#6b4e35]" />
        <span>
          Quote this on the website
          <span className="mt-0.5 block text-[11px] text-cocoa-400">
            Only tick this if the client is happy to be quoted publicly. Their first name and
            last initial appear on the landing page — never the full name, and never the
            comment on its own.
          </span>
        </span>
      </label>
      {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
      {state.ok && <p className="text-sm text-cocoa-600">{state.ok}</p>}
      <button className="btn-secondary btn-sm" type="submit">
        Record feedback
      </button>
    </form>
  );
}
