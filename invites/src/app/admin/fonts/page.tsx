import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import { allFacesUrl, faceRules, type Fonts } from '@/lib/theme';
import { loadEntry, builtInBook, type FaceRow, type SetRow } from '@/lib/fonts';
import { LOOKS, LOOK_KEYS, LOOK_BY_KEY, lookLine, lookTitle, isLook } from '@/lib/looks';
import { FaceList, SetList, type Face, type Set, type Sample } from './forms';

export const metadata = { title: 'Fonts', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Faces and pairings, drawn in themselves.
 *
 * The whole reason this page exists is that a font name is not a font: a
 * list reading "Marcellus / Jost" tells her nothing she can judge, and a
 * list where each name is drawn in its own face and each pairing sets a
 * real sentence tells her everything. So every name below is set in the
 * face it names, and every pairing carries the line it would write under a
 * heading — in English and in Tagalog, because the wording is written twice
 * and a face missing a ñ shows it here rather than on somebody's
 * invitation.
 *
 * One stylesheet draws the menu: `allFacesUrl` asks Google for every family
 * at once, since ninety separate requests would be a page that arrives in
 * pieces. Faces she uploaded come from our own bucket through `@font-face`
 * rules beside it.
 */
export default async function FontsPage() {
  const user = await requireStaffPage('templates.view');
  const [faces, sets] = await Promise.all([
    prisma.fontFace.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: 500 }),
    prisma.fontSet.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: 500 }),
  ]);
  const designs = await prisma.template.findMany({ select: { name: true, look: true }, take: 200 });

  /*
   * An empty pair of tables is a database that has been migrated and not yet
   * stocked. Saying so beats an empty page, because the fix is one command
   * and nothing else on the page hints at it.
   */
  const stock = builtInBook();
  const bare = !faces.length || !sets.length;

  const rows: FaceRow[] = faces.map((f) => ({
    key: f.key, name: f.name, family: f.family, stack: f.stack,
    source: f.source === 'FILE' ? 'file' : 'google',
    weights: f.weights, url: f.url, licence: f.licence, enabled: f.enabled, sortOrder: f.sortOrder,
  }));
  const setRows: SetRow[] = sets.map((s) => ({
    key: s.key, name: s.name, displayKey: s.displayKey, bodyKey: s.bodyKey, namesKey: s.namesKey, scriptKey: s.scriptKey,
    scriptStyle: s.scriptStyle === 'italic' ? 'italic' : 'normal',
    alsoKeys: s.alsoKeys, voice: isLook(s.voice) ? s.voice : 'modern', minTier: s.minTier, enabled: s.enabled, sortOrder: s.sortOrder,
  }));
  const byKey = new Map(rows.map((f) => [f.key, f]));

  /*
   * One stylesheet for the whole menu, over every *face*, not over the
   * pairings.
   *
   * Measured, after writing it the other way round: asking for the families
   * the pairings name leaves a face in no pairing drawn in the fallback —
   * which is exactly the face she has just added and most wants to look at.
   * A page whose promise is "every name is drawn in its own face" has to ask
   * for every name.
   */
  const everyFace: { fonts: Fonts }[] = rows
    .filter((f) => f.source === 'google' && f.enabled)
    .map((f) => ({ fonts: { display: f.stack, body: f.stack, load: [loadEntry(f)] } }));
  const ourFaces: Fonts = {
    display: '', body: '', load: [],
    files: rows.filter((f) => f.source === 'file' && f.enabled && f.url).map((f) => ({ family: f.family, url: f.url })),
  };

  const usedBy = (key: string) =>
    setRows.filter((s) => [s.displayKey, s.bodyKey, s.namesKey, s.scriptKey, ...s.alsoKeys].includes(key)).map((s) => s.name);

  const faceProps: Face[] = rows.map((f) => ({
    key: f.key, name: f.name, family: f.family, stack: f.stack,
    source: f.source === 'file' ? 'FILE' : 'GOOGLE',
    weights: f.weights, url: f.url, licence: f.licence, enabled: f.enabled, sortOrder: f.sortOrder,
    usedBy: usedBy(f.key),
  }));
  const setProps: Set[] = setRows.map((s) => ({
    key: s.key, name: s.name, displayKey: s.displayKey, bodyKey: s.bodyKey, namesKey: s.namesKey, scriptKey: s.scriptKey,
    scriptStyle: s.scriptStyle, voice: s.voice, minTier: s.minTier, enabled: s.enabled, sortOrder: s.sortOrder,
    drawnOn: designs.filter((d) => d.look === s.key).map((d) => d.name),
  }));

  /*
   * The sample every pairing sets, per voice. Real wording from the look the
   * pairing speaks in — the line above the names, the names themselves, a
   * heading and a line of body — rather than a pangram, because what she is
   * judging is an invitation and not an alphabet.
   */
  const samples: Record<string, Sample> = Object.fromEntries(
    LOOK_KEYS.map((key) => {
      const look = LOOK_BY_KEY[key];
      return [key, {
        name: `Maria ${look.joiner === 'and' ? 'and' : '&'} Juan`,
        lines: { en: lookLine(look, 'en', 'cover') ?? '', tl: lookLine(look, 'tl', 'cover') ?? '' },
        heading: { en: lookTitle(look, 'en', 'invitation') ?? 'The Invitation', tl: lookTitle(look, 'tl', 'invitation') ?? 'Ang Paanyaya' },
        body: { en: lookLine(look, 'en', 'invitation') ?? '', tl: lookLine(look, 'tl', 'invitation') ?? '' },
      } satisfies Sample];
    }),
  );

  const mayEdit = can(user.role, 'templates.edit');
  const fileFaces = rows.filter((f) => f.source === 'file').length;

  return (
    <>
      {/* the menu drawn in the faces it offers; see allFacesUrl on why one request */}
      {everyFace.length > 0 && <link rel="stylesheet" href={allFacesUrl(everyFace)} />}
      {ourFaces.files?.length ? <style href="admin-faces" precedence="default">{faceRules(ourFaces)}</style> : null}

      <PageHeader
        title="Fonts"
        subtitle={`${faces.length} face${faces.length === 1 ? '' : 's'} · ${sets.length} pairing${sets.length === 1 ? '' : 's'}${fileFaces ? ` · ${fileFaces} of ours` : ''}`}
      />

      {bare && (
        <div className="card mb-4 border-[color:var(--bad)] p-4">
          <p className="font-medium">These tables are empty.</p>
          <p className="hint">
            The migration makes them and the stock is installed separately, so a guest is being served the {stock.sets.length} pairings written into the
            code until somebody runs <code>npm run db:fonts</code>. Nothing is broken; nothing here is editable either.
          </p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-1 font-semibold">Faces</h2>
          <p className="hint mb-2">
            A typeface. A Google family is fetched by name and free; a face of ours is a file you licensed and uploaded, served from our bucket. Every
            name below is drawn in its own face — if one reads in the wrong letters, that face is not arriving.
          </p>
          {mayEdit ? <FaceList faces={faceProps} voices={[...LOOK_KEYS]} /> : <ReadOnly rows={faceProps.map((f) => ({ key: f.key, name: f.name, stack: f.stack, note: f.family }))} />}
        </section>

        <section className="card p-4">
          <h2 className="mb-1 font-semibold">Pairings</h2>
          <p className="hint mb-2">
            Which face plays which part, and whose wording it borrows. The lowest package decides who may choose it; a design&rsquo;s own pairing is
            served whatever the package. The five named after the looks are the five voices — {LOOKS.map((l) => l.name).join(', ')} — and a pairing you
            add borrows one of them so its headings are never followed by a gap.
          </p>
          {mayEdit ? <SetList sets={setProps} faces={faceProps} voices={[...LOOK_KEYS]} samples={samples} /> : <ReadOnly rows={setProps.map((s) => ({ key: s.key, name: s.name, note: `${s.minTier} · ${s.voice}` }))} />}
        </section>
      </div>
    </>
  );
}

/** For staff who may look at designs but not change them. */
function ReadOnly({ rows }: { rows: { key: string; name: string; stack?: string; note?: string }[] }) {
  return (
    <ul className="space-y-0.5">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-wrap items-baseline gap-2 border-b border-[color:var(--color-sand-100)] py-1 last:border-b-0">
          <span className="text-lg leading-tight" style={r.stack ? { fontFamily: r.stack } : undefined}>{r.name}</span>
          {r.note && <span className="text-xs text-[color:var(--color-ink-500)]">{r.note}</span>}
        </li>
      ))}
    </ul>
  );
}
