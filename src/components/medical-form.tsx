'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveMedicalAction, type FormState } from '@/app/portal/clients/actions';
import { WAIVER_STAFF } from '@/lib/consent';
import { NOT_APPLICABLE, isNotApplicable } from '@/lib/intake';

export type FieldDef = {
  id: string;
  key: string;
  label: string;
  section: 'PROFILE' | 'MEDICAL';
  type: string;
  options: string[];
  helpText: string;
  /** Only meaningful once the named question is ticked. */
  dependsOnKey?: string | null;
  /** Ticking this means none of the others in its section apply. */
  isNoneOption?: boolean;
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
        {/* Follow-ups sit under the question they belong to rather than in the
            flat list. Unlike the guest's own form nothing is hidden here — the
            desk is copying a paper form and needs to see every box — but
            "Whereabouts?" on its own line, between two unrelated questions, is
            a riddle. */}
        {medical
          .filter((f) => !f.dependsOnKey)
          .map((f) => (
            <div key={f.id} className="space-y-2">
              <FieldInput field={f} value={values[f.key]} />
              {medical
                .filter((d) => d.dependsOnKey === f.key)
                .map((d) => (
                  <div key={d.id} className="ml-3 border-l-2 border-sand-200 pl-3">
                    <FieldInput field={d} value={values[d.key]} />
                  </div>
                ))}
            </div>
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

/**
 * A written health question, with "N/A" beside it.
 *
 * The same escape the guest gets on the public form, so the desk can record
 * "asked, nothing to report" rather than leaving a box that reads identically
 * to one nobody got to. Only the free-text questions: a dropdown already has a
 * blank option, and "N/A" in a number box means nothing.
 *
 * Controlled, unlike everything else on this form, because ticking N/A has to
 * empty the box on screen as well as in what gets saved — a greyed-out box
 * still showing "almond oil" while it saves N/A is a lie the desk would have
 * no reason to doubt.
 */
function WaivableField({ field, value }: { field: FieldDef; value: unknown }) {
  const name = `field_${field.key}`;
  const inputId = `medical-${field.key}`;
  const [na, setNa] = useState(isNotApplicable(value));
  const [text, setText] = useState(isNotApplicable(value) ? '' : String(value ?? ''));
  const Box = field.type === 'TEXTAREA' ? 'textarea' : 'input';

  return (
    <div className="block">
      <span className="flex items-baseline justify-between gap-3">
        <label className="label" htmlFor={inputId}>{field.label}</label>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 pb-1 text-xs text-cocoa-500">
          <input type="checkbox" className="h-4 w-4 accent-[#6b4e35]"
            checked={na} onChange={(e) => setNa(e.target.checked)} />
          N/A
        </label>
      </span>
      {/* A disabled control submits nothing, so the sentinel travels in a
          hidden field of the same name. */}
      {na && <input type="hidden" name={name} value={NOT_APPLICABLE} />}
      <Box
        id={inputId}
        name={na ? undefined : name}
        className={field.type === 'TEXTAREA' ? 'textarea' : 'input'}
        {...(field.type === 'TEXTAREA' ? { rows: 2 } : {})}
        disabled={na}
        value={na ? '' : text}
        placeholder={na ? 'Nothing to report' : undefined}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          setText(e.target.value)}
      />
      {field.helpText && (
        <span className="mt-1 block text-[11px] text-cocoa-400">{field.helpText}</span>
      )}
    </div>
  );
}

/**
 * Free text in the health section, asked of everyone: the questions that can be
 * waved off — the same two the guest can wave off on the public form.
 *
 * Not the follow-ups. This screen shows those whether or not their tick box is
 * set, and "N/A" against a question that was never really asked is noise on the
 * record rather than an answer; the tick box above it already says it does not
 * apply.
 */
function isWaivable(f: FieldDef): boolean {
  return (
    f.section === 'MEDICAL' &&
    (f.type === 'TEXT' || f.type === 'TEXTAREA') &&
    !f.dependsOnKey &&
    !f.isNoneOption
  );
}

function FieldInput({ field, value }: { field: FieldDef; value: unknown }) {
  const name = `field_${field.key}`;

  if (isWaivable(field)) return <WaivableField field={field} value={value} />;

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
