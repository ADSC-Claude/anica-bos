'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveAppointmentAction, type FormState } from '@/app/portal/appointments/actions';
import { formatPeso } from '@/lib/money';

export type ServiceOption = { id: string; name: string; durationMinutes: number; priceCents: number; categoryName: string };
export type ClientOption = { id: string; name: string; mobile: string };
export type SimpleOption = { id: string; name: string };

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </button>
  );
}

/**
 * Booking form used for both new and edited appointments. Therapist and room
 * choices are re-checked against live availability whenever the time changes,
 * and the server re-validates before saving.
 */
export function AppointmentForm({
  branchId,
  services,
  clients,
  partners,
  initial,
  walkIn,
}: {
  branchId: string;
  services: ServiceOption[];
  clients: ClientOption[];
  partners: SimpleOption[];
  initial?: {
    id?: string;
    clientId?: string;
    serviceIds?: string[];
    startAtLocal?: string;
    employeeId?: string;
    resourceId?: string;
    notes?: string;
    partnerId?: string;
  };
  walkIn?: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveAppointmentAction, {});

  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const [clientQuery, setClientQuery] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>(initial?.serviceIds ?? []);
  const [startLocal, setStartLocal] = useState(initial?.startAtLocal ?? defaultStart());
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? 'any');
  const [resourceId, setResourceId] = useState(initial?.resourceId ?? 'any');
  const [therapists, setTherapists] = useState<SimpleOption[]>([]);
  const [resources, setResources] = useState<SimpleOption[]>([]);
  const [checking, setChecking] = useState(false);

  const chosen = services.filter((s) => serviceIds.includes(s.id));
  const duration = chosen.reduce((a, s) => a + s.durationMinutes, 0);
  const price = chosen.reduce((a, s) => a + s.priceCents, 0);
  const startIso = startLocal ? new Date(`${startLocal}:00+08:00`).toISOString() : '';

  useEffect(() => {
    if (!serviceIds.length || !startIso) {
      setTherapists([]);
      setResources([]);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const params = new URLSearchParams({
      branchId,
      date: startLocal.slice(0, 10),
      serviceIds: serviceIds.join(','),
      startAt: startIso,
    });
    fetch(`/api/public/availability?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setTherapists(data.therapists ?? []);
        setResources(data.resources ?? []);
      })
      .finally(() => !cancelled && setChecking(false));
    return () => { cancelled = true; };
  }, [serviceIds, startIso, branchId, startLocal]);

  const filteredClients = clientQuery
    ? clients.filter(
        (c) =>
          c.name.toLowerCase().includes(clientQuery.toLowerCase()) ||
          c.mobile.includes(clientQuery.replace(/\D/g, '')),
      ).slice(0, 30)
    : clients.slice(0, 30);

  const byCategory = new Map<string, ServiceOption[]>();
  for (const s of services) {
    byCategory.set(s.categoryName, [...(byCategory.get(s.categoryName) ?? []), s]);
  }

  return (
    <form action={action} className="space-y-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="startAt" value={startIso} />
      <input type="hidden" name="clientId" value={clientId} />
      {walkIn && <input type="hidden" name="source" value="WALK_IN" />}
      {serviceIds.map((id) => (
        <input key={id} type="hidden" name="serviceIds" value={id} />
      ))}

      <div className="card-pad space-y-3">
        <p className="section-title">Client</p>
        <input
          className="input"
          placeholder="Search by name or mobile…"
          value={clientQuery}
          onChange={(e) => setClientQuery(e.target.value)}
        />
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {filteredClients.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setClientId(c.id)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${
                clientId === c.id ? 'border-cocoa-600 bg-cocoa-50' : 'border-sand-200'
              }`}
            >
              <span className="font-medium text-cocoa-800">{c.name}</span>
              <span className="num text-xs text-cocoa-400">{c.mobile}</span>
            </button>
          ))}
          {filteredClients.length === 0 && (
            <p className="muted">
              No match. <a href="/portal/clients/new" className="underline underline-offset-4">Add a new client</a>.
            </p>
          )}
        </div>
      </div>

      <div className="card-pad space-y-3">
        <p className="section-title">Services</p>
        {[...byCategory.entries()].map(([cat, list]) => (
          <fieldset key={cat}>
            <legend className="mb-1 text-xs font-semibold text-cocoa-500">{cat}</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {list.map((s) => {
                const active = serviceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setServiceIds((prev) =>
                        prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                      )
                    }
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm ${
                      active ? 'border-cocoa-600 bg-cocoa-50' : 'border-sand-200'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-cocoa-800">{s.name}</span>
                      <span className="block text-[11px] text-cocoa-400">{s.durationMinutes} min</span>
                    </span>
                    <span className="num shrink-0 text-xs">{formatPeso(s.priceCents)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        {chosen.length > 0 && (
          <p className="rounded-xl bg-sand-100 px-3 py-2 text-sm text-cocoa-700">
            {duration} minutes · <strong className="num">{formatPeso(price)}</strong>
          </p>
        )}
      </div>

      <div className="card-pad space-y-3">
        <p className="section-title">When &amp; who</p>
        <label className="block">
          <span className="label">Start time (Asia/Manila)</span>
          <input
            type="datetime-local"
            className="input"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Therapist {checking && <span className="text-cocoa-400">(checking…)</span>}</span>
            <select name="employeeId" className="select" value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="any">Any available (rotation order)</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {!checking && serviceIds.length > 0 && therapists.length === 0 && (
              <span className="mt-1 block text-[11px] text-clay-500">
                Nobody with these skills is on duty and free then.
              </span>
            )}
          </label>
          <label className="block">
            <span className="label">Room / bed</span>
            <select name="resourceId" className="select" value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}>
              <option value="any">Any available</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
        </div>

        {partners.length > 0 && (
          <label className="block">
            <span className="label">Referred by a partner (optional)</span>
            <select name="partnerId" className="select" defaultValue={initial?.partnerId ?? ''}>
              <option value="">— none —</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="label">Notes</span>
          <textarea name="notes" className="textarea" rows={2} defaultValue={initial?.notes} />
        </label>
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl bg-clay-500/10 px-3 py-2 text-sm text-clay-500">
          {state.error}
        </p>
      )}

      <Save label={initial?.id ? 'Save changes' : 'Create booking'} />
    </form>
  );
}

function defaultStart(): string {
  const now = new Date(Date.now() + 8 * 3600_000);
  now.setUTCMinutes(now.getUTCMinutes() < 30 ? 30 : 60, 0, 0);
  return now.toISOString().slice(0, 16);
}
