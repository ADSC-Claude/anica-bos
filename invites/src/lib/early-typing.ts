/**
 * What was typed into the form before the form was listening.
 *
 * The boxes come from the server ready to use: they are on the screen, and
 * they take keystrokes, some time before the script that hears them has
 * arrived and run. On a laptop on good wifi that gap is a blink. On a phone
 * on mobile data it is seconds — measured at nearly four on a throttled
 * line — and a customer typing inside it watches their words appear in the
 * box and go nowhere. The box holds them. Nothing else hears them. The line
 * under the form still reads "Auto-save on", and the answer was never
 * written down.
 *
 * So the first thing the form does once it is running is read the boxes
 * back, through this. Kept apart from the form itself because it is a
 * comparison and nothing more: no React, no server actions, and a plain
 * object with a `value` is a box, which is what lets it be tested.
 */
import type { SectionData } from './sections';

/**
 * The kinds of box whose answer is simply what is in it.
 *
 * Everything else keeps its answer somewhere other than one `value` — a
 * list of rows, an upload, a set of ticks, the pull-up date and time. None
 * of those can be half-filled by a keystroke that arrived early, because
 * none of them takes one, so none of them is read back.
 */
export const TYPED_IN = new Set(['text', 'url', 'textarea', 'number', 'select']);

/** Just enough of a box to read: the tests hand it an object, the form hands it an input. */
export type Boxish = { value: string };

/**
 * The answers the boxes hold that the server did not put there.
 *
 * `find` is given a box's id and hands back the box, or nothing where the
 * part being edited does not carry that question.
 */
export function typedBeforeReady(
  fields: { key: string; type: string }[],
  initial: SectionData,
  find: (id: string) => Boxish | null,
): SectionData {
  const typed: SectionData = {};
  for (const f of fields) {
    if (!TYPED_IN.has(f.type)) continue;
    const box = find(`f-${f.key}`);
    if (!box) continue;
    const was = initial[f.key];
    if (f.type === 'number') {
      const now = box.value === '' ? null : Number(box.value);
      if (!Number.isNaN(now) && now !== (was ?? null)) typed[f.key] = now;
    } else if (box.value !== String(was ?? '')) {
      typed[f.key] = box.value;
    }
  }
  return typed;
}
