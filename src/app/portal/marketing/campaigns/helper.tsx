'use client';

import { useActionState, useState } from 'react';
import { buildCampaignAction, type CampaignState } from '../actions';

const SEGMENTS = [
  { value: 'lapsed', label: 'Lapsed clients (overdue to return)' },
  { value: 'birthday', label: 'Birthdays this month' },
  { value: 'top', label: 'Top 50 spenders' },
  { value: 'members', label: 'Active members' },
  { value: 'all', label: 'All clients' },
];

export function CampaignHelper({ branchId }: { branchId: string }) {
  const [state, action] = useActionState<CampaignState, FormData>(buildCampaignAction, {});
  const [copied, setCopied] = useState('');

  const recipients = state.recipients ?? [];
  const mobiles = recipients.map((r) => r.mobile).filter(Boolean).join(', ');
  const emails = recipients.map((r) => r.email).filter(Boolean).join(', ');
  const csv = [
    'Name,Mobile,Email',
    ...recipients.map((r) => `"${r.name}",${r.mobile},${r.email}`),
  ].join('\n');

  async function copy(what: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(what);
    setTimeout(() => setCopied(''), 2000);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <form action={action} className="card-pad space-y-3">
        <input type="hidden" name="branchId" value={branchId} />
        <label className="block">
          <span className="label">Segment</span>
          <select name="segment" className="select" defaultValue="lapsed">
            {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Email subject</span>
          <input name="subject" className="input" defaultValue="We miss you at ANICA Wellness Spa" />
        </label>
        <label className="block">
          <span className="label">Message</span>
          <textarea
            name="message"
            className="textarea"
            rows={6}
            defaultValue={
              'Hi {{name}},\n\nIt has been a while! Book your next session with us and enjoy 10% off — just mention this message at reception.\n\nSee you soon,\nANICA Wellness Spa'
            }
          />
          <span className="mt-1 block text-[11px] text-cocoa-400">
            Use <code>{'{{name}}'}</code> to insert each client&apos;s name.
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary flex-1" type="submit" name="send" value="preview">
            Build list
          </button>
          <button className="btn-primary flex-1" type="submit" name="send" value="email">
            Send emails now
          </button>
        </div>
        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-cocoa-600">{state.ok}</p>}
      </form>

      <div className="space-y-3">
        {recipients.length > 0 ? (
          <>
            <div className="card-pad">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="section-title">{recipients.length} recipient(s)</p>
                <div className="flex flex-wrap gap-1.5">
                  <button className="btn-secondary btn-sm" onClick={() => copy('mobiles', mobiles)}>
                    {copied === 'mobiles' ? 'Copied!' : 'Copy mobile numbers'}
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => copy('emails', emails)}>
                    {copied === 'emails' ? 'Copied!' : 'Copy emails'}
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => copy('csv', csv)}>
                    {copied === 'csv' ? 'Copied!' : 'Copy as CSV'}
                  </button>
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Mobile</th>
                      <th>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((r) => (
                      <tr key={`${r.mobile}-${r.email}`}>
                        <td>{r.name}</td>
                        <td className="num text-xs">{r.mobile}</td>
                        <td className="text-xs text-cocoa-500">{r.email || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {state.messageText && (
              <div className="card-pad">
                <div className="mb-2 flex items-center justify-between">
                  <p className="section-title">Ready-made SMS / Messenger text</p>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => copy('sms', state.messageText!.replaceAll('{{name}}', 'there'))}
                  >
                    {copied === 'sms' ? 'Copied!' : 'Copy text'}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap rounded-xl bg-sand-100 p-3 text-sm text-cocoa-700">
                  {state.messageText.replaceAll('{{name}}', 'there')}
                </pre>
              </div>
            )}
          </>
        ) : (
          <div className="card px-6 py-10 text-center">
            <p className="text-sm text-cocoa-500">
              Choose a segment and press <strong>Build list</strong> to see who it reaches.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
