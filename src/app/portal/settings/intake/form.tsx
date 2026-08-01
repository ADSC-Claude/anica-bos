'use client';

import { useActionState, useState } from 'react';
import { saveFieldDefinitionAction, type FormState } from '../actions';

type F = {
  id: string; label: string; section: string; type: string; options: string;
  helpText: string; required: boolean; showOnline: boolean; alertValues: string;
  dependsOnKey: string; isNoneOption: boolean;
  sortRank: number; retired: boolean;
};

export function IntakeFieldForm({ fields }: { fields: F[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveFieldDefinitionAction, {});
  const [selectedId, setSelectedId] = useState('');
  const current = fields.find((f) => f.id === selectedId);
  const [type, setType] = useState(current?.type ?? 'BOOLEAN');

  return (
    <div className="card-pad space-y-4">
      <label className="block">
        <span className="label">Edit a question</span>
        <select className="select" value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setType(fields.find((f) => f.id === e.target.value)?.type ?? 'BOOLEAN');
          }}>
          <option value="">— add a new question —</option>
          {fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>

      <form action={action} className="space-y-3" key={selectedId}>
        <input type="hidden" name="id" value={selectedId} />
        <label className="block">
          <span className="label">Question label *</span>
          <input name="label" className="input" defaultValue={current?.label} required />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Section</span>
            <select name="section" className="select" defaultValue={current?.section ?? 'MEDICAL'}>
              <option value="MEDICAL">Health &amp; contraindications</option>
              <option value="PROFILE">Preferences</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Answer type</span>
            <select name="type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="BOOLEAN">Yes / no tick box</option>
              <option value="TEXT">Short text</option>
              <option value="TEXTAREA">Long text</option>
              <option value="NUMBER">Number</option>
              <option value="DATE">Date</option>
              <option value="SELECT">Choose one</option>
              <option value="MULTISELECT">Choose many</option>
            </select>
          </label>
        </div>

        {(type === 'SELECT' || type === 'MULTISELECT') && (
          <label className="block">
            <span className="label">Options (comma separated)</span>
            <input name="options" className="input" defaultValue={current?.options}
              placeholder="Light, Medium, Firm, Deep" />
          </label>
        )}

        <label className="block">
          <span className="label">Help text</span>
          <input name="helpText" className="input" defaultValue={current?.helpText} />
        </label>
        <label className="block">
          <span className="label">Raise a therapist alert when the answer is</span>
          <input name="alertValues" className="input" defaultValue={current?.alertValues}
            placeholder="true" />
          <span className="mt-1 block text-[11px] text-cocoa-400">
            Use <code>true</code> for tick boxes. Free-text answers always alert when filled in.
          </span>
        </label>
        <label className="block">
          <span className="label">Display order</span>
          <input name="sortRank" type="number" className="input" defaultValue={current?.sortRank ?? 0} />
        </label>

        <label className="block">
          <span className="label">Only ask this if another question is ticked</span>
          <input name="dependsOnKey" className="input" defaultValue={current?.dependsOnKey}
            placeholder="recent_surgery" />
          <span className="mt-1 block text-[11px] text-cocoa-400">
            The key of a tick-box question. This one then appears underneath it, and only once
            it is ticked — &ldquo;Recent surgery or injury&rdquo; tells a therapist to be careful
            of something without saying what or where.
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="isNoneOption" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.isNoneOption ?? false} />
          Ticking this means none of the others apply
        </label>
        <span className="block text-[11px] text-cocoa-400">
          Shown last in its section. Ticking it clears the rest; ticking any of the rest clears
          it. A blank checklist cannot be told from a skipped one, and &ldquo;she didn&rsquo;t
          say&rdquo; is not something to write on a medical record.
        </span>

        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="showOnline" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.showOnline ?? true} />
          Ask this on the public booking form (short version)
        </label>
        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="required" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.required ?? false} />
          Required
        </label>
        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="retired" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.retired ?? false} />
          Retire this question (hidden; existing answers are kept)
        </label>

        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-cocoa-600">{state.ok}</p>}
        <button className="btn-primary w-full" type="submit">
          {selectedId ? 'Save question' : 'Add question'}
        </button>
      </form>
    </div>
  );
}
