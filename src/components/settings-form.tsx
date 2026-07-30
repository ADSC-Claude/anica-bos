'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveSettingsAction, type FormState } from '@/app/portal/settings/actions';

function Save({ label = 'Save settings' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </button>
  );
}

/**
 * Thin wrapper so every Settings section shares the same submit/feedback
 * behaviour; each page supplies its own fields.
 */
export function SettingsForm({
  section,
  children,
  saveLabel,
}: {
  section: string;
  children: React.ReactNode;
  saveLabel?: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveSettingsAction, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="section" value={section} />
      {children}
      {state.error && (
        <p role="alert" className="rounded-xl bg-clay-500/10 px-3 py-2 text-sm text-clay-500">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-xl bg-moss-100 px-3 py-2 text-sm text-moss-700">{state.ok}</p>
      )}
      <Save label={saveLabel} />
    </form>
  );
}
