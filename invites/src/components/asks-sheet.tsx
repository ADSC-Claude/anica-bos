import type { Occasion } from '@prisma/client';
import { documentOf, type DesignDoc } from '@/lib/design';
import { asksOf, askCounts, type Ask } from '@/lib/asks';

/**
 * What this design asks for.
 *
 * One list, from one function, in every place somebody needs to know it: the
 * studio's left column while she draws, the design's own page in the admin,
 * the top of the encoder's workspace, and the customer's invitation page
 * before they start filling anything in.
 *
 * It is the same `asksOf` in all four, which is the point. A sheet written
 * separately would drift from the design within a week, and the one thing
 * worse than not telling a customer what to prepare is telling them wrong.
 *
 * A design that asks for nothing prints nothing: every design today asks for
 * nothing, so this is invisible until somebody draws a frame and marks it.
 */

export function asksFor(template: { design?: unknown; layout?: string }, occasion: Occasion): Ask[] {
  return asksOf(documentOf(template), occasion);
}

export function AsksSheet({
  asks,
  title = 'What this design asks for',
  intro,
  className = 'card space-y-2 p-4',
}: {
  asks: Ask[];
  title?: string;
  intro?: string;
  className?: string;
}) {
  if (asks.length === 0) return null;
  const counts = askCounts(asks);
  const photos = asks.filter((a) => a.kind === 'photo');
  const writings = asks.filter((a) => a.kind === 'text');
  return (
    <section className={className}>
      <h2 className="display text-lg">{title}</h2>
      {intro && <p className="text-sm text-[color:var(--color-ink-500)]">{intro}</p>}
      <p className="text-sm">
        <strong>{counts.photos}</strong> photograph{counts.photos === 1 ? '' : 's'} and <strong>{counts.writings}</strong> writing{counts.writings === 1 ? '' : 's'}.
      </p>
      {photos.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {photos.map((a) => (
            <li key={a.id}>
              <span className="font-semibold">{a.label}</span>
              {a.guidance && <span className="block text-[color:var(--color-ink-500)]">{a.guidance}</span>}
              {a.ifEmpty === 'leave' || a.ifEmpty === undefined
                ? <span className="block text-[11px] text-[color:var(--color-ink-500)]">Left empty, the space is simply left.</span>
                : <span className="block text-[11px] text-[color:var(--color-ink-500)]">Left empty, the design puts something of its own there.</span>}
            </li>
          ))}
        </ul>
      )}
      {writings.length > 0 && (
        <ul className="space-y-1 text-sm">
          {writings.map((a) => (
            <li key={a.id}>
              <span className="font-semibold">{a.label}</span>
              {a.room && <span className="text-[color:var(--color-ink-500)]"> — about {a.room} letters</span>}
            </li>
          ))}
        </ul>
      )}
      {counts.orphans > 0 && (
        <p className="text-[11px] text-amber-800">
          {counts.orphans} of these {counts.orphans === 1 ? 'points' : 'point'} at something this occasion does not have, and {counts.orphans === 1 ? 'stays' : 'stay'} empty here.
        </p>
      )}
    </section>
  );
}

/** The same list, for a design whose document is still only a draft. */
export const draftAsks = (t: { designDraft?: unknown; layout?: string }, occasion: Occasion): Ask[] =>
  asksOf(documentOf({ design: t.designDraft, layout: t.layout }) as DesignDoc | null, occasion);
