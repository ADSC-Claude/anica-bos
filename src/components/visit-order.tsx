'use client';

/**
 * The visit, as a list you can reorder — not a question about it.
 *
 * The obvious way to ask "which treatment first?" is to ask it. That turns out
 * badly: with two treatments it is a question nobody has the information to
 * answer, and with three it is a series of them. What a guest actually wants to
 * know is the *consequence* — a sauna first means she is done at 3:20, a
 * massage first means 3:15 and she showers at the end.
 *
 * So the answer is the schedule itself, with arrows. Move a treatment and the
 * times move with it. Nothing is asked and everything is visible.
 */

import { changeoverFor, houseOrder, planVisit, type Treatment } from '@/lib/itinerary';

export type VisitTreatment = Treatment & {
  priceCents?: number;
};

function clock(d: Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  }).format(d);
}

function spell(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Put a newly chosen treatment where the spa would usually run it. */
export function insertInHouseOrder<T extends Treatment>(chosen: T[], added: T): T[] {
  return houseOrder([...chosen, added]);
}

export function VisitOrder({
  treatments,
  changeoverMinutes,
  startAt,
  onReorder,
}: {
  /** In visit order — index 0 runs first. */
  treatments: VisitTreatment[];
  changeoverMinutes: number;
  /** Once a start time is chosen, real clock times are shown instead of lengths. */
  startAt?: Date | null;
  onReorder: (next: VisitTreatment[]) => void;
}) {
  if (treatments.length < 2) return null;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= treatments.length) return;
    const next = [...treatments];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onReorder(next);
  };

  const anchor = startAt ?? new Date();
  const steps = planVisit({ treatments, startAt: anchor, changeoverMinutes });
  const total = steps.length
    ? Math.round((steps[steps.length - 1].endAt.getTime() - anchor.getTime()) / 60_000)
    : 0;

  return (
    <div className="rounded-2xl border border-sand-200 bg-sand-50 p-3">
      <p className="label mb-0.5">Your visit, in order</p>
      <p className="mb-2 text-[11px] leading-relaxed text-cocoa-500">
        We have put these in the order we usually run them. Move them if you would rather have
        one first — the times change to match.
      </p>

      <ol className="space-y-1">
        {steps.map((step, i) => {
          const gap = i < steps.length - 1 ? changeoverFor(step, changeoverMinutes) : 0;
          return (
            <li key={step.serviceId}>
              <div className="flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-2.5 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sand-200 text-[11px] font-bold text-cocoa-700">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-cocoa-800">
                    {step.name}
                  </span>
                  <span className="num block text-[11px] text-cocoa-500">
                    {startAt
                      ? `${clock(step.startAt)} – ${clock(step.endAt)}`
                      : spell(step.durationMinutes)}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    aria-label={`Move ${step.name} earlier`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-300 text-cocoa-600 transition enabled:hover:border-cocoa-400 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === steps.length - 1}
                    aria-label={`Move ${step.name} later`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-300 text-cocoa-600 transition enabled:hover:border-cocoa-400 disabled:opacity-30"
                  >
                    ↓
                  </button>
                </span>
              </div>

              {gap > 0 && (
                // Named rather than left as dead space: a guest who sees an
                // unexplained twenty-minute hole assumes it is a mistake.
                <p className="py-1 pl-8 text-[11px] text-cocoa-400">
                  ↓ {gap} min to change over and get you settled
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-2 text-[11px] text-cocoa-500">
        About <strong className="text-cocoa-700">{spell(total)}</strong> door to door
        {startAt ? `, finishing around ${clock(steps[steps.length - 1].endAt)}` : ''}.
      </p>
    </div>
  );
}
