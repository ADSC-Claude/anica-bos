'use client';

/**
 * The visit, treatment by treatment, with the times it really ran.
 *
 * A visit is no longer one block: a guest booked for a sauna then a massage is
 * in two places at two times, with a gap between for the shower and the setting
 * up. The desk needs to see that laid out, and — more importantly — to say when
 * each part actually started and finished, because the plan is a guess and the
 * floor is not.
 *
 * Logging a real time is not bookkeeping. A treatment that runs twenty minutes
 * over holds its place twenty minutes longer, which moves the rest of the visit
 * and changes what the website may sell to the next caller. Pressing "Started"
 * is how the spa stops promising a bed somebody is still lying on.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { logTreatmentTimeAction, type FormState } from '@/app/portal/appointments/actions';
import { formatPeso } from '@/lib/money';

export type Leg = {
  id: string;
  name: string;
  therapist: string;
  placeName: string;
  durationMinutes: number;
  priceCents: number;
  startAtIso: string | null;
  endAtIso: string | null;
  actualStartAtIso: string | null;
  actualEndAtIso: string | null;
  changeoverAfter: number;
};

function clock(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  }).format(new Date(iso));
}

/** `YYYY-MM-DDTHH:mm` in Manila, for a datetime-local field. */
function localValue(iso: string | null): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 16);
}

function Pending({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary btn-sm" disabled={pending}>
      {pending ? '…' : label}
    </button>
  );
}

export function ItineraryPanel({
  appointmentId,
  legs,
  canEdit,
}: {
  appointmentId: string;
  legs: Leg[];
  canEdit: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(logTreatmentTimeAction, {});

  return (
    <div className="card-pad">
      <h2 className="section-title mb-1">The visit</h2>
      <p className="mb-3 text-[11px] leading-relaxed text-cocoa-400">
        Each treatment has its own place and its own clock. Logging when one really started or
        finished moves the rest of the visit and frees the place at the right time — the website
        will not offer a bed somebody is still on.
      </p>

      {state.error && (
        <p role="alert" className="mb-3 rounded-xl bg-clay-500/10 px-3 py-2 text-sm text-clay-500">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="mb-3 rounded-xl bg-sage-500/10 px-3 py-2 text-sm text-cocoa-700">{state.ok}</p>
      )}

      <ol className="space-y-3">
        {legs.map((leg, i) => {
          const running = Boolean(leg.actualStartAtIso) && !leg.actualEndAtIso;
          const done = Boolean(leg.actualEndAtIso);
          const late =
            leg.actualStartAtIso && leg.startAtIso
              ? Math.round(
                  (new Date(leg.actualStartAtIso).getTime() - new Date(leg.startAtIso).getTime()) /
                    60_000,
                )
              : 0;
          return (
            <li key={leg.id}>
              <div
                className={`rounded-2xl border p-3 ${
                  running
                    ? 'border-gilt-500 bg-gilt-500/5'
                    : done
                      ? 'border-sand-200 bg-sand-50'
                      : 'border-sand-200 bg-white'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-cocoa-800">
                      <span className="mr-1.5 text-cocoa-400">{i + 1}.</span>
                      {leg.name}
                    </p>
                    <p className="text-xs text-cocoa-500">
                      {leg.placeName} · {leg.durationMinutes} min · {leg.therapist}
                    </p>
                  </div>
                  <span className="num shrink-0 text-sm">{formatPeso(leg.priceCents)}</span>
                </div>

                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <p className="text-cocoa-500">
                    Planned{' '}
                    <strong className="num font-semibold text-cocoa-700">
                      {clock(leg.startAtIso)} – {clock(leg.endAtIso)}
                    </strong>
                  </p>
                  <p className={done || running ? 'text-cocoa-700' : 'text-cocoa-400'}>
                    Actual{' '}
                    <strong className="num font-semibold">
                      {clock(leg.actualStartAtIso)} – {clock(leg.actualEndAtIso)}
                    </strong>
                    {running && <span className="ml-1 text-gilt-600">· in progress</span>}
                    {late > 0 && (
                      <span className="ml-1 text-clay-500">· started {late} min late</span>
                    )}
                  </p>
                </div>

                {canEdit && (
                  <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="appointmentId" value={appointmentId} />
                    <input type="hidden" name="segmentId" value={leg.id} />
                    <label className="block">
                      <span className="label text-[10px]">Started</span>
                      <input
                        type="datetime-local"
                        name="actualStartAt"
                        className="input h-9 py-1 text-xs"
                        defaultValue={localValue(leg.actualStartAtIso)}
                      />
                    </label>
                    <label className="block">
                      <span className="label text-[10px]">Ended</span>
                      <input
                        type="datetime-local"
                        name="actualEndAt"
                        className="input h-9 py-1 text-xs"
                        defaultValue={localValue(leg.actualEndAtIso)}
                      />
                    </label>
                    <Pending label="Save times" />
                    {/* The common case is "it is happening now", and typing the
                        current time into a picker to say so is a waste of the
                        receptionist's hands. */}
                    <button
                      type="submit"
                      name="stamp"
                      value={leg.actualStartAtIso ? 'end' : 'start'}
                      className="btn-ghost btn-sm"
                    >
                      {leg.actualStartAtIso ? 'Ended just now' : 'Started just now'}
                    </button>
                  </form>
                )}
              </div>

              {leg.changeoverAfter > 0 && i < legs.length - 1 && (
                <p className="py-1.5 pl-4 text-[11px] text-cocoa-400">
                  ↓ {leg.changeoverAfter} min changeover — shower, consultation, setting up
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
