import 'server-only';
import { googleFontsUrl } from './theme';

/**
 * Does Google actually have this family, in these weights?
 *
 * Asked once, when she saves a face, because the alternative is finding out
 * from a guest's phone. A family name Google does not have makes the whole
 * request 400, and a 400 means **every** family in that request falls back
 * — so one mistyped name does not break one face, it breaks the page.
 *
 * Three things this catches, all of them measured against the live service
 * rather than assumed:
 *
 * - A family that does not exist: `Nonexistent Family Xyz` → 400.
 * - A family typed in the wrong case: `cormorant garamond` → 400. Google is
 *   case-sensitive about family names, which is the mistake anybody typing
 *   one from memory makes.
 * - A weights spec that asks for nothing the family has: `Pacifico:wght@700`
 *   → 400, where `Pacifico:wght@400;700` is fine. So the weights are asked
 *   together with the name, not separately.
 *
 * Unreachable is not the same as wrong. If the request cannot be made at
 * all — no network, a proxy in the way, Google having a bad day — the face
 * is saved with a note saying it could not be checked, because refusing her
 * work over a network blip is worse than a face she will see is wrong the
 * first time she looks at the menu.
 */
export type FamilyCheck = { ok: true; checked: boolean; note?: string } | { ok: false; why: string };

/** A real browser's, because Google serves a different stylesheet to each engine and refuses some agents outright. */
const AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function checkGoogleFamily(family: string, weights: string): Promise<FamilyCheck> {
  const name = family.trim();
  if (!name) return { ok: false, why: 'A Google face needs a family name — the name as it is written on fonts.google.com.' };
  if (!/^[A-Za-z0-9][A-Za-z0-9 '+-]{0,60}$/.test(name)) {
    return { ok: false, why: `“${name}” is not a family name Google would recognise. Copy it exactly as fonts.google.com writes it — letters, digits and spaces.` };
  }
  const url = googleFontsUrl({ display: '', body: '', load: [weights ? `${name}:${weights}` : name] });
  let response: Response;
  try {
    response = await fetch(url, { headers: { 'user-agent': AGENT }, cache: 'no-store' });
  } catch {
    return { ok: true, checked: false, note: 'Google could not be reached just now, so this face was saved unchecked. Open the menu and look at it.' };
  }
  if (response.ok) {
    const css = await response.text();
    // A 200 with nothing in it would be a family that exists and has no faces
    if (!css.includes('@font-face')) return { ok: false, why: `Google has “${name}” but served no faces for it. Check the weights.` };
    return { ok: true, checked: true };
  }
  if (response.status === 400) {
    return {
      ok: false,
      why: weights
        ? `Google does not have “${name}” in those weights. Family names are case-sensitive — copy it exactly as fonts.google.com writes it — and check that every weight in “${weights}” is one the family offers.`
        : `Google does not have a family called “${name}”. Family names are case-sensitive; copy it exactly as fonts.google.com writes it.`,
    };
  }
  return { ok: true, checked: false, note: `Google answered ${response.status}, so this face was saved unchecked. Open the menu and look at it.` };
}
