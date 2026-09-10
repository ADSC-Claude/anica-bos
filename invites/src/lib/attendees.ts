/**
 * Who a guest is bringing, and what they are to them.
 *
 * A reply used to be a list of names and nothing else, which told the couple
 * how many places to lay but not what kind. That is most of the seating
 * problem: a spouse sits beside them, a child may want the kids' table or a
 * high chair, and a yaya or a driver is very often fed apart and not seated at
 * a named table at all. Three people at a table of ten is a different table
 * depending on which three.
 *
 * So each companion carries a relationship — to the guest who is bringing
 * them, not to the couple. "Kaibigan" here means the guest's friend, which is
 * the question a person can actually answer about the person beside them.
 *
 * The first entry of a party is the guest themselves and carries no
 * relationship; they are not their own plus one.
 */
import { t, type Lang } from './copy';

/**
 * The relationships offered, in the order they are shown.
 *
 * Ordered by how close the person sits rather than alphabetically: the ones
 * who share the guest's table first, the ones who often do not last. "Other"
 * is the honest end of any list this short.
 */
export const RELATIONS = [
  'spouse',
  'partner',
  'child',
  'parent',
  'sibling',
  'relative',
  'friend',
  'colleague',
  'helper',
  'driver',
  'other',
] as const;

export type Relation = (typeof RELATIONS)[number];

/** One person in a party: a name, and what they are to the guest bringing them. */
export type Attendee = { name: string; relation: string };

export function isRelation(s: string): s is Relation {
  return (RELATIONS as readonly string[]).includes(s);
}

/**
 * A stored party, whatever shape it was saved in.
 *
 * Replies made before there was a relationship to ask about are a plain array
 * of names, and they are still in the database, so both shapes are read here
 * and everything downstream sees only the one. An old reply comes back with
 * empty relationships, which is true — nobody was asked.
 */
export function attendeesOf(raw: unknown): Attendee[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a): Attendee => {
      if (typeof a === 'string') return { name: a.trim(), relation: '' };
      if (a && typeof a === 'object') {
        const o = a as Record<string, unknown>;
        const name = typeof o.name === 'string' ? o.name.trim() : '';
        const relation = typeof o.relation === 'string' && isRelation(o.relation) ? o.relation : '';
        return { name, relation };
      }
      return { name: '', relation: '' };
    })
    .filter((a) => a.name);
}

/** Everyone but the guest: the plus ones, which is what the question is about. */
export function companionsOf(raw: unknown): Attendee[] {
  return attendeesOf(raw).slice(1);
}

/** The words a person reads for a relationship; a blank one says nothing. */
export function relationLabel(relation: string, lang: Lang = 'en'): string {
  return relation && isRelation(relation) ? t(lang, `rsvp.rel.${relation}` as 'rsvp.rel.spouse') : '';
}

/** "Ana Santos (spouse)", or just the name when nobody said. */
export function attendeeLine(a: Attendee, lang: Lang = 'en'): string {
  const rel = relationLabel(a.relation, lang);
  return rel ? `${a.name} (${rel.toLowerCase()})` : a.name;
}
