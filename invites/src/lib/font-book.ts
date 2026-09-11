import 'server-only';
import { cache } from 'react';
import { prisma } from './db';
import { builtInBook, bookSets, type BookSet, type FaceRow, type SetRow } from './fonts';
import { isLook } from './looks';

/**
 * The owner's faces and pairings, read once per request.
 *
 * Every rule about them lives in fonts.ts, which knows nothing about a
 * database; this is the twenty lines that fetch the rows and hand them over.
 * `cache` is React's per-request memo, so the six places that resolve a
 * theme on one page render share one pair of queries.
 *
 * **An empty pair of tables falls back to the code's own book.** The
 * migration that creates them creates them empty, so between a deploy and
 * the first `npm run db:fonts` there is a window in which a guest would
 * otherwise be served an invitation with no faces named at all. The
 * fallback closes it, and because the seed writes exactly `builtInBook()`,
 * the two are the same page.
 */
export const fontBook = cache(async (): Promise<BookSet[]> => {
  const [faces, sets] = await Promise.all([
    prisma.fontFace.findMany({ orderBy: { sortOrder: 'asc' }, take: 500 }),
    prisma.fontSet.findMany({ orderBy: { sortOrder: 'asc' }, take: 500 }),
  ]);
  if (!faces.length || !sets.length) return bookSets(builtInBook());
  return bookSets({
    faces: faces.map(
      (f): FaceRow => ({
        key: f.key, name: f.name, family: f.family, stack: f.stack,
        source: f.source === 'FILE' ? 'file' : 'google',
        weights: f.weights, url: f.url, licence: f.licence, enabled: f.enabled, sortOrder: f.sortOrder,
      }),
    ),
    sets: sets.map(
      (s): SetRow => ({
        key: s.key, name: s.name,
        displayKey: s.displayKey, bodyKey: s.bodyKey, namesKey: s.namesKey, scriptKey: s.scriptKey,
        scriptStyle: s.scriptStyle === 'italic' ? 'italic' : 'normal',
        alsoKeys: s.alsoKeys,
        voice: isLook(s.voice) ? s.voice : 'modern',
        minTier: s.minTier, enabled: s.enabled, sortOrder: s.sortOrder,
      }),
    ),
  });
});
