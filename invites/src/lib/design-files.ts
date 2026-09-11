import 'server-only';
import { prisma } from './db';

/**
 * What a design's own uploads weigh and how long its clips run.
 *
 * The checklist cannot measure a file — nothing in it fetches anything, so
 * that the studio can keep the list live as she draws — so the numbers come
 * from the row written when each file arrived. They are handed in rather
 * than looked up inside the rules, and a file with no row is *unknown*
 * rather than zero: a checklist that says "fine" about something it cannot
 * see is worse than one that says nothing.
 *
 * This exists because four places need the same two maps and one of them is
 * the publish gate. A `blocks` line that the studio shows and the door does
 * not enforce is not a rule, it is a suggestion — so the door reads exactly
 * what the screen read, from here.
 */
export type DesignFiles = { weights: Record<string, number>; lengths: Record<string, number> };

const EMPTY: DesignFiles = { weights: {}, lengths: {} };

/** One design's files. */
export async function designFiles(templateId: string): Promise<DesignFiles> {
  return (await designFilesFor([templateId]))[templateId] ?? EMPTY;
}

/**
 * Several designs' files in one query, for the Templates list.
 *
 * A list of designs each asking for its own rows is the N+1 that makes an
 * admin page slow for no reason, and the count beside every design has to
 * agree with the door or it is misinformation.
 */
export async function designFilesFor(templateIds: string[]): Promise<Record<string, DesignFiles>> {
  if (!templateIds.length) return {};
  const rows = await prisma.media.findMany({
    where: { templateId: { in: templateIds } },
    select: { templateId: true, url: true, bytes: true, durationMs: true },
    take: 2000,
  });
  /*
   * The library's pieces as well, and they belong to no design.
   *
   * A piece is uploaded once and used by whichever designs want it, so its
   * row carries no templateId — which meant a design built out of library
   * pieces had a checklist that could not weigh anything it used. It matters
   * most for the one thing the library is the natural home of: a moving
   * picture, which is never re-encoded and is therefore the heaviest thing on
   * a page after a clip. Weights only; a piece has no length.
   */
  const pieces = await prisma.media.findMany({
    where: { kind: 'DESIGN_PIECE' },
    select: { url: true, bytes: true },
    take: 2000,
  });
  const shared: Record<string, number> = {};
  for (const p of pieces) if (p.bytes !== null && p.bytes > 0) shared[p.url] = p.bytes;
  const out: Record<string, DesignFiles> = {};
  for (const id of templateIds) out[id] = { weights: { ...shared }, lengths: {} };
  for (const r of rows) {
    const into = r.templateId ? out[r.templateId] : undefined;
    if (!into) continue;
    if (r.bytes !== null && r.bytes > 0) into.weights[r.url] = r.bytes;
    if (r.durationMs !== null && r.durationMs > 0) into.lengths[r.url] = r.durationMs;
  }
  return out;
}
