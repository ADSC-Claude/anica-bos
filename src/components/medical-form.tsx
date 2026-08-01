'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveMedicalAction, type FormState } from '@/app/portal/clients/actions';
import { WAIVER_STAFF } from '@/lib/consent';

export type FieldDef = {
  id: string;
  key: string;
  label: string;
  section: 'PROFILE' | 'MEDICAL';
  type: string;
  options: string[];
  helpText: string;
};

function Save() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save intake'}
    </button>
  );
}

/**
 * Renders whatever questions the Owner has configured in Settings — nothing
 * here is hard-coded, so adding a question updates this screen and the public
 * booking form at once.
 */
export function MedicalForm({
  clientId,
  fields,
  values,
  consentGiven,
  waiverGiven,
}: {
  clientId: string;
  fields: FieldDef[];
  values: Record<string, unknown>;
  consentGiven: boolean;
  waiverGiven: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveMedicalAction, {});
  const profile = fields.filter((f) => f.section === 'PROFILE');
  const medical = fields.filter((f) => f.section === 'MEDICAL');

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="clientId" value={clientId} />

      {profile.length > 0 && (
        <div className="space-y-3">
          <p className="section-title">Preferences</p>
          {profile.map((f) => (
            <FieldInput key={f.id} field={f} value={values[f.key]} />
          ))}
        </div>
      )}

      <div className="space-y-3">
        <p className="section-title">Health &amp; contraindications</p>
        <p className="muted">
          Encode what the client wrote on the paper intake form. Flagged answers show as an
          alert on the appointment card and at checkout.
        </p>
        {medical.map((f) => (
          <FieldInput key={f.id} field={f} value={values[f.key]} />
        ))}
      </div>

      <label className="flex items-start gap-3 rounded-xl bg-sand-100 p-3">
        <input type="checkbox" name="consentGiven" className="mt-0.5 h-5 w-5 accent-[#6b4e35]"
          defaultChecked={consentGiven} />
        <span className="text-xs text-cocoa-600">
          Client consented to storage of sensitive personal information (RA 10173). Health
          details are visible only to signed-in staff and are excluded from every export
          except the Owner&apos;s full backup.
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-xl bg-sand-100 p-3">
        <input type="checkbox" name="waiverGiven" className="mt-0.5 h-5 w-5 accent-[#6b4e35]"
          defaultChecked={waiverGiven} />
        <span className="text-xs text-cocoa-600">{WAIVER_STAFF}</span>
      </label>

      {state.error && (
        <p role="alert" className="rounded-xl bg-clay-500/10 px-3 py-2 text-sm text-clay-500">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-xl bg-cocoa-100 px-3 py-2 text-sm text-cocoa-700">{state.ok}</p>
      )}

      <Save />
    </form>
  );
}

function FieldInput({ field, value }: { field: FieldDef; value: unknown }) {
  const name = `field_${field.key}`;

  if (field.type === 'BOOLEAN') {
    return (
      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-sand-200 px-3 py-2">
        <input type="checkbox" name={name} className="h-5 w-5 accent-[#6b4e35]"
          defaultChecked={Boolean(value)} />
        <span className="text-sm text-cocoa-700">{field.label}</span>
      </label>
    );
  }
  if (field.type === 'SELECT') {
    return (
      <label className="block">
        <span className="label">{field.label}</span>
        <select name={name} className="select" defaultValue={String(value ?? '')}>
          <option value="">— none —</option>
          {field.options.map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === 'MULTISELECT') {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset>
        <legend className="label">{field.label}</legend>
        <div className="flex flex-wrap gap-2">
          {field.options.map((o) => (
            <label key={o} className="flex items-center gap-2 rounded-xl border border-sand-200 px-3 py-2 text-sm">
              <input type="checkbox" name={name} value={o} className="h-4 w-4 accent-[#6b4e35]"
                defaultChecked={selected.includes(o)} />
              {o}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (field.type === 'TEXTAREA') {
    return (
      <label className="block">
        <span className="label">{field.label}</span>
        <textarea name={name} className="textarea" rows={2} defaultValue={String(value ?? '')} />
        {field.helpText && <span className="mt-1 block text-[11px] text-cocoa-400">{field.helpText}</span>}
      </label>
    );
  }
  return (
    <label className="block">
      <span className="label">{field.label}</span>
      <input
        name={name}
        type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
        className="input"
        defaultValue={String(value ?? '')}
      />
      {field.helpText && <span className="mt-1 block text-[11px] text-cocoa-400">{field.helpText}</span>}
    </label>
  );
}
