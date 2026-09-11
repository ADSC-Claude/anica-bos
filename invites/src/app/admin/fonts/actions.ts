'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireStaffSession, assertPermission } from '@/lib/guard';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/errors';
import { storeFile } from '@/lib/storage';
import { fontFile, whyNotAFace, FONT_MAX_BYTES, FONT_MAX_LABEL } from '@/lib/fontfile';
import { checkGoogleFamily } from '@/lib/google-fonts';
import { faceKey, familyOf, DEFAULT_WEIGHTS } from '@/lib/fonts';
import { isLook } from '@/lib/looks';
import { TIERS } from '@/lib/tiers';
import type { Tier } from '@prisma/client';

/**
 * The Fonts page's own actions.
 *
 * Everything here is `templates.edit`: a face is design material, and
 * whoever may change what a design is drawn in may change what it is set
 * in. Every write is audited, because a face reaches every invitation on
 * every design that pairs it and there should be a record of who changed it.
 */

export type Said = { ok: true; said: string } | { ok: false; error: string };

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function staff() {
  const user = await requireStaffSession();
  assertPermission(user, 'templates.edit');
  return user;
}

const done = (said: string): Said => {
  revalidatePath('/admin/fonts');
  return { ok: true, said };
};

/**
 * Add or change a face.
 *
 * A Google face is checked against Google before it is written — see
 * `checkGoogleFamily`, and the reason it matters: one bad family name makes
 * the whole stylesheet request 400, so it does not break that face, it
 * breaks every face on the page.
 */
export async function saveFaceAction(key: string | null, fd: FormData): Promise<Said> {
  const user = await staff();
  const name = s(fd, 'name');
  const family = s(fd, 'family');
  const source = s(fd, 'source') === 'FILE' ? ('FILE' as const) : ('GOOGLE' as const);
  const weights = s(fd, 'weights');
  const licence = s(fd, 'licence');
  const enabled = fd.get('enabled') === 'on';
  if (!family) return { ok: false, error: 'A face needs a family name.' };

  const file = fd.get('file');
  let url = s(fd, 'url');
  let note = '';

  if (source === 'GOOGLE') {
    const check = await checkGoogleFamily(family, weights);
    if (!check.ok) return { ok: false, error: check.why };
    if (check.note) note = ` ${check.note}`;
    url = '';
  } else {
    if (file instanceof File && file.size > 0) {
      const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (!fontFile(bytes)) return { ok: false, error: whyNotAFace(bytes) };
      if (file.size > FONT_MAX_BYTES) {
        return { ok: false, error: `A face must be ${FONT_MAX_LABEL} or smaller; this one is ${Math.round(file.size / 1024)} kB. A full-Unicode .ttf usually needs subsetting to the Latin characters first, which is also what turns it into a .woff2.` };
      }
      const stored = await storeFile({ file, entityType: 'font', entityId: faceKey(family) || 'face', visibility: 'public', accept: 'font', maxBytes: FONT_MAX_BYTES });
      url = stored.url;
    }
    if (!url) return { ok: false, error: 'A face of your own needs its file. Upload the .woff2, .woff, .ttf or .otf.' };
    /*
     * Her own declaration, and required. The system cannot check a licence —
     * nothing in a font file says who may serve it — but it can refuse to
     * serve a face with nothing written down about where the right came
     * from, which is the difference between an oversight and a decision.
     */
    if (!licence) return { ok: false, error: 'Say where the right to serve this face on a website came from — the foundry and the date, or the licence name. The system cannot check a licence; it can only refuse to serve one nobody has vouched for.' };
  }

  const stack = s(fd, 'stack') || `'${family}', ${source === 'FILE' ? 'serif' : 'serif'}`;
  const data = {
    name: name || family,
    family,
    stack,
    source,
    weights: source === 'GOOGLE' ? weights || DEFAULT_WEIGHTS : '',
    url,
    licence,
    enabled,
    sortOrder: Number(s(fd, 'sortOrder')) || 0,
  };
  if (familyOf(stack) !== family) {
    return { ok: false, error: `The fallback chain has to begin with the family itself. Write ${JSON.stringify(`'${family}', …`)} and then what to draw in until it arrives.` };
  }

  const at = key ?? faceKey(family);
  if (!at) return { ok: false, error: 'That family name makes no key. Use letters and digits.' };
  const had = await prisma.fontFace.findUnique({ where: { key: at } });
  if (had && !key) return { ok: false, error: `There is already a face called “${had.name}” under that name.` };
  const row = had
    ? await prisma.fontFace.update({ where: { key: at }, data })
    : await prisma.fontFace.create({ data: { ...data, key: at } });
  await audit(user, { module: 'templates', action: had ? 'font.face.edit' : 'font.face.add', entityType: 'FontFace', entityId: row.id, summary: `${row.name} (${row.family})`, before: had ?? undefined, after: row });
  return done(`${had ? 'Saved' : 'Added'} ${row.name}.${note}`);
}

/** Switch a face on or off. Off leaves every set that names it unusable, which the page says. */
export async function toggleFaceAction(key: string, on: boolean): Promise<Said> {
  const user = await staff();
  const row = await prisma.fontFace.update({ where: { key }, data: { enabled: on } });
  await audit(user, { module: 'templates', action: 'font.face.toggle', entityType: 'FontFace', entityId: row.id, summary: `${row.name} ${on ? 'on' : 'off'}` });
  return done(`${row.name} is ${on ? 'on' : 'off'}.`);
}

/**
 * Delete a face — refused while a set still names it.
 *
 * A set whose display face is gone stops being a set at all, and an
 * invitation set in it falls back to the design's. That is the right
 * behaviour when a face disappears by accident; it is not a thing to let
 * her do by accident.
 */
export async function deleteFaceAction(key: string): Promise<Said> {
  const user = await staff();
  const row = await prisma.fontFace.findUnique({ where: { key } });
  if (!row) return { ok: false, error: 'That face is gone already.' };
  const used = await prisma.fontSet.findMany({
    where: { OR: [{ displayKey: key }, { bodyKey: key }, { namesKey: key }, { scriptKey: key }, { alsoKeys: { has: key } }] },
    select: { name: true },
    take: 6,
  });
  if (used.length) {
    return { ok: false, error: `${row.name} is in ${used.length === 1 ? 'a pairing' : `${used.length} pairings`}: ${used.map((u) => u.name).join(', ')}. Take it out of those first, or switch it off instead of deleting it.` };
  }
  await prisma.fontFace.delete({ where: { key } });
  await audit(user, { module: 'templates', action: 'font.face.delete', entityType: 'FontFace', entityId: row.id, summary: row.name, before: row });
  return done(`${row.name} is gone.`);
}

/** Add or change a pairing. */
export async function saveSetAction(key: string | null, fd: FormData): Promise<Said> {
  const user = await staff();
  const name = s(fd, 'name');
  if (!name) return { ok: false, error: 'A pairing needs a name — it is what she picks it by.' };
  const displayKey = s(fd, 'displayKey');
  const bodyKey = s(fd, 'bodyKey');
  if (!displayKey || !bodyKey) return { ok: false, error: 'A pairing needs at least a face for the headings and a face to read.' };
  const named = [displayKey, bodyKey, s(fd, 'namesKey'), s(fd, 'scriptKey')].filter(Boolean);
  const faces = await prisma.fontFace.findMany({ where: { key: { in: named } }, select: { key: true, enabled: true, name: true } });
  const missing = named.filter((k) => !faces.some((f) => f.key === k));
  if (missing.length) return { ok: false, error: `No such face: ${missing.join(', ')}.` };
  const off = faces.filter((f) => !f.enabled);
  if (off.length) return { ok: false, error: `${off.map((f) => f.name).join(' and ')} ${off.length === 1 ? 'is' : 'are'} switched off, so a pairing cannot use ${off.length === 1 ? 'it' : 'them'} yet.` };
  const voice = s(fd, 'voice');
  if (!isLook(voice)) return { ok: false, error: 'Pick whose wording this pairing speaks in.' };
  const minTier = s(fd, 'minTier');
  if (!TIERS.includes(minTier as Tier)) return { ok: false, error: 'Pick the lowest package that may choose it.' };

  const data = {
    name,
    displayKey,
    bodyKey,
    namesKey: s(fd, 'namesKey'),
    scriptKey: s(fd, 'scriptKey'),
    scriptStyle: s(fd, 'scriptStyle') === 'italic' ? 'italic' : 'normal',
    voice,
    minTier: minTier as Tier,
    enabled: fd.get('enabled') === 'on',
    sortOrder: Number(s(fd, 'sortOrder')) || 0,
  };
  const at = key ?? faceKey(name);
  if (!at) return { ok: false, error: 'That name makes no key. Use letters and digits.' };
  const had = await prisma.fontSet.findUnique({ where: { key: at } });
  if (had && !key) return { ok: false, error: `There is already a pairing called “${had.name}”.` };
  const row = had
    ? await prisma.fontSet.update({ where: { key: at }, data })
    : await prisma.fontSet.create({ data: { ...data, key: at } });
  await audit(user, { module: 'templates', action: had ? 'font.set.edit' : 'font.set.add', entityType: 'FontSet', entityId: row.id, summary: row.name, before: had ?? undefined, after: row });
  return done(`${had ? 'Saved' : 'Added'} ${row.name}.`);
}

/**
 * Switch a pairing on or off, and say what that touches.
 *
 * Switching one off is a blast radius: every invitation set in it falls
 * back to its design's, and every design set in it loses its faces. So the
 * count comes back in the sentence rather than being discovered later.
 */
export async function toggleSetAction(key: string, on: boolean): Promise<Said> {
  const user = await staff();
  const row = await prisma.fontSet.update({ where: { key }, data: { enabled: on } });
  const [designs, invitations] = await Promise.all([
    prisma.template.count({ where: { look: key } }),
    prisma.invitation.count({ where: { content: { path: ['theme', 'lookKey'], equals: key } } }),
  ]);
  const touched = !on && (designs || invitations)
    ? ` ${designs ? `${designs} design${designs === 1 ? '' : 's'}` : ''}${designs && invitations ? ' and ' : ''}${invitations ? `${invitations} invitation${invitations === 1 ? '' : 's'}` : ''} fall back to the design's own faces.`
    : '';
  await audit(user, { module: 'templates', action: 'font.set.toggle', entityType: 'FontSet', entityId: row.id, summary: `${row.name} ${on ? 'on' : 'off'}` });
  return done(`${row.name} is ${on ? 'on' : 'off'}.${touched}`);
}

/** Delete a pairing — refused while a design is set in it. */
export async function deleteSetAction(key: string): Promise<Said> {
  const user = await staff();
  const row = await prisma.fontSet.findUnique({ where: { key } });
  if (!row) return { ok: false, error: 'That pairing is gone already.' };
  const designs = await prisma.template.findMany({ where: { OR: [{ look: key }, { fontSets: { has: key } }] }, select: { name: true }, take: 6 });
  if (designs.length) {
    return { ok: false, error: `${row.name} is what ${designs.map((d) => d.name).join(', ')} ${designs.length === 1 ? 'is' : 'are'} set in or offers. Change those first, or switch it off instead of deleting it.` };
  }
  await prisma.fontSet.delete({ where: { key } });
  await audit(user, { module: 'templates', action: 'font.set.delete', entityType: 'FontSet', entityId: row.id, summary: row.name, before: row });
  return done(`${row.name} is gone.`);
}
