'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveClientAction, type FormState } from '@/app/portal/clients/actions';
import { DateSelect } from '@/components/date-select';

const CITIES = [
  'Quezon City', 'Caloocan City', 'Las Piñas City', 'Makati City', 'Malabon City',
  'Mandaluyong City', 'Manila', 'Marikina City', 'Muntinlupa City', 'Navotas City',
  'Parañaque City', 'Pasay City', 'Pasig City', 'Pateros', 'San Juan City',
  'Taguig City', 'Valenzuela City', 'Antipolo City', 'Cainta', 'Other',
];

export type ClientFormValues = {
  id?: string;
  name?: string;
  mobile?: string;
  email?: string;
  birthday?: string;
  addressCity?: string;
  addressLine?: string;
  barangay?: string;
  barangayHint?: string;
  notes?: string;
  tags?: string[];
  pwdIdNumber?: string;
  seniorIdNumber?: string;
  consentGiven?: boolean;
};

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </button>
  );
}

export function ClientForm({ values }: { values: ClientFormValues }) {
  const [state, action] = useActionState<FormState, FormData>(saveClientAction, {});

  return (
    <form action={action} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <div className="card-pad space-y-3">
        <p className="section-title">Contact details</p>
        <label className="block">
          <span className="label">Full name *</span>
          <input name="name" className="input" defaultValue={values.name} required />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Mobile number *</span>
            <input name="mobile" className="input" inputMode="tel" defaultValue={values.mobile} required
              placeholder="0917 123 4567" />
          </label>
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" className="input" defaultValue={values.email} />
            <span className="mt-1 block text-[11px] text-cocoa-400">
              Needed for confirmations, birthday greetings and renewal reminders.
            </span>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* A div, not a label: a label points at one control, and this is
              three. Wrapping them all would make a click anywhere on the word
              "Birthday" focus the month and nothing else. */}
          <div className="block">
            <span className="label">Birthday</span>
            <DateSelect
              name="birthday"
              value={values.birthday}
              latestYear={new Date(Date.now() + 8 * 3600_000).getUTCFullYear()}
              earliestYear={new Date(Date.now() + 8 * 3600_000).getUTCFullYear() - 100}
            />
          </div>
          <label className="block">
            <span className="label">City</span>
            <select name="addressCity" className="select" defaultValue={values.addressCity ?? 'Quezon City'}>
              <option value="">— select —</option>
              {CITIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Barangay</span>
            <input name="barangay" className="input" defaultValue={values.barangay} />
          </label>
          <label className="block">
            <span className="label">Street / building</span>
            <input name="addressLine" className="input" defaultValue={values.addressLine} />
          </label>
        </div>
      </div>

      <div className="card-pad space-y-3">
        <p className="section-title">Preferences &amp; IDs</p>
        <label className="block">
          <span className="label">Notes / preferences</span>
          <textarea name="notes" className="textarea" rows={3} defaultValue={values.notes}
            placeholder="e.g. prefers firm pressure, no scented oil, always books with Maricel" />
        </label>
        <label className="block">
          <span className="label">Tags (comma separated)</span>
          <input name="tags" className="input" defaultValue={values.tags?.join(', ')}
            placeholder="regular, corporate, VIP" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">PWD ID number</span>
            <input name="pwdIdNumber" className="input" defaultValue={values.pwdIdNumber} />
            <span className="mt-1 block text-[11px] text-cocoa-400">
              Saved once, then reused automatically at checkout.
            </span>
          </label>
          <label className="block">
            <span className="label">Senior citizen ID number</span>
            <input name="seniorIdNumber" className="input" defaultValue={values.seniorIdNumber} />
          </label>
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-sand-100 p-3">
          <input type="checkbox" name="consentGiven" className="mt-0.5 h-5 w-5 accent-[#6b4e35]"
            defaultChecked={values.consentGiven} />
          <span className="text-xs text-cocoa-600">
            The client consented to us storing their personal and health information
            (Data Privacy Act of 2012).
          </span>
        </label>
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl bg-clay-500/10 px-3 py-2 text-sm text-clay-500">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <Save label={values.id ? 'Save changes' : 'Create client'} />
      </div>
    </form>
  );
}
