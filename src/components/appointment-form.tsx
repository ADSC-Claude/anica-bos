'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveAppointmentAction, type FormState } from '@/app/portal/appointments/actions';
import { FloorPlan, type PlanPlace } from '@/components/floor-plan';
import { formatPeso } from '@/lib/money';

/**
 * How often the desk re-reads the floor while a booking is being written up.
 *
 * A walk-in is served with the guest standing there, which is exactly when
 * somebody online takes the last bed. The server refuses an overlap either way,
 * but being told after typing the whole booking is a bad way to find out.
 */
const FLOOR_REFRESH_MS = 15_000;

export type ServiceOption = { id: string; name: string; durationMinutes: number; priceCents: number; categoryName: string };
export type ClientOption = {
  id: string;
  name: string;
  mobile: string;
  /** When the health answers were last taken. Null means never. */
  medicalUpdatedAt?: Date | string | null;
};
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
  const [plan, setPlan] = useState<PlanPlace[]>([]);
  /** Which kinds of place these treatments can be done in; null means any. */
  const [accepts, setAccepts] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  /** Bumped on a poll so the effect re-runs without the time having changed. */
  const [floorTick, setFloorTick] = useState(0);

  const chosen = services.filter((s) => serviceIds.includes(s.id));
  const duration = chosen.reduce((a, s) => a + s.durationMinutes, 0);
  const price = chosen.reduce((a, s) => a + s.priceCents, 0);
  const startIso = startLocal ? new Date(`${startLocal}:00+08:00`).toISOString() : '';

  useEffect(() => {
    if (!serviceIds.length || !startIso) {
      setTherapists([]);
      setPlan([]);
      setAccepts(null);
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
    if (initial?.id) params.set('excludeAppointmentId', initial.id);
    fetch(`/api/public/availability?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setTherapists(data.therapists ?? []);
        setPlan(data.plan ?? []);
        setAccepts(data.accepts ?? null);
      })
      .finally(() => !cancelled && setChecking(false));
    return () => { cancelled = true; };
  }, [serviceIds, startIso, branchId, startLocal, initial?.id, floorTick]);

  // The floor keeps moving while the form is open — an online booking can take
  // the bed the receptionist is about to pick. Only polls once there is a time
  // to check against, and stops as soon as the form closes.
  useEffect(() => {
    if (!serviceIds.length || !startIso) return;
    const t = setInterval(() => setFloorTick((n) => n + 1), FLOOR_REFRESH_MS);
    return () => clearInterval(t);
  }, [serviceIds.length, startIso]);

  // A place that was free when it was picked can be taken a moment later. Drop
  // the selection rather than submit a booking the server is about to refuse.
  useEffect(() => {
    if (resourceId === 'any' || !plan.length) return;
    const still = plan.find((p) => p.id === resourceId);
    if (!still || still.remaining <= 0 || still.heldByOther) setResourceId('any');
  }, [plan, resourceId]);

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

        {/* A returning guest keeps her name, her number and her address. Her
            health answers are the one thing that expires — a pregnancy, a new
            medication, an injury since March — and the desk has no way to know
            that from a row in a list. So the date is put in front of them. */}
        {clientId && (() => {
          const picked = clients.find((c) => c.id === clientId);
          if (!picked) return null;
          const when = picked.medicalUpdatedAt ? new Date(picked.medicalUpdatedAt) : null;
          const days = when ? Math.floor((Date.now() - when.getTime()) / 86_400_000) : null;
          const stale = days === null || days > 180;
          return (
            <p
              className={`rounded-xl border px-3 py-2 text-xs ${
                stale
                  ? 'border-gilt-500 bg-sand-50 text-cocoa-700'
                  : 'border-sand-200 text-cocoa-500'
              }`}
            >
              Health answers{' '}
              {when ? `last taken ${when.toLocaleDateString('en-PH', {
                day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila',
              })}` : 'have never been recorded'}
              {stale && ' — please check them with the guest.'}{' '}
              <a
                href={`/portal/clients/${picked.id}`}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4"
              >
                Open her record
              </a>
            </p>
          );
        })()}
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
        </div>

        <input type="hidden" name="resourceId" value={resourceId} />
        <fieldset className="block">
          <legend className="label">Room / bed</legend>
          {serviceIds.length === 0 || !startIso ? (
            <p className="muted text-sm">Choose a treatment and a time to see the floor.</p>
          ) : plan.length === 0 ? (
            <p className="muted text-sm">
              {checking ? 'Checking the floor…' : 'Nothing is free at that time.'}
            </p>
          ) : (
            <>
              <FloorPlan
                plan={plan}
                guests={[{
                  name: '',
                  accepts,
                  serviceLabel: chosen.map((s) => s.name).join(', '),
                }]}
                seats={resourceId === 'any' ? {} : { 0: resourceId }}
                activeGuest={0}
                onSelectGuest={() => {}}
                // Tapping the chosen place again releases it, which is the only
                // way back to "any" once something has been picked.
                onPick={(placeId) => setResourceId((p) => (p === placeId ? 'any' : placeId))}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setResourceId('any')}
                  className={`min-h-9 rounded-xl border px-3 text-xs font-semibold transition ${
                    resourceId === 'any'
                      ? 'border-cocoa-600 bg-cocoa-600 text-white'
                      : 'border-sand-200 bg-white text-cocoa-700 hover:border-cocoa-300'
                  }`}
                >
                  Any available
                </button>
                <span className="text-[11px] text-cocoa-400">
                  {resourceId === 'any'
                    ? 'The first free place is taken at save time.'
                    : 'Tap the chosen place again to go back to any.'}
                  {' '}Re-checked every {FLOOR_REFRESH_MS / 1000}s.
                </span>
              </div>
            </>
          )}
        </fieldset>

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
