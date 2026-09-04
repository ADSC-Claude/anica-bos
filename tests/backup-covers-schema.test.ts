/**
 * The backup must cover the whole schema.
 *
 * Two hand-written table lists had already drifted from the schema by two
 * tables — `EmploymentEvent` and the `_AdditionalCategories` join — and nothing
 * caught it. Both were empty, so the restore round-trip reported success, and a
 * backup missing a table is indistinguishable from a good one right up until
 * the restore you actually needed.
 *
 * So this compares the list against the generated Prisma schema rather than
 * against a second list somebody has to remember to edit. Add a model, and this
 * fails until the backup knows about it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { JOIN_TABLES, TABLES } from '../src/lib/backup-tables';

/** Prisma's delegate key for a model: the name with a lower-case first letter. */
const delegateFor = (model: string) => model[0].toLowerCase() + model.slice(1);

/**
 * Implicit many-to-many relations, which Prisma stores in a join table it
 * generates no model for. Both sides of the relation are lists; anything else
 * is a one-to-many and lives in a column on the child.
 */
function implicitJoinTables(): string[] {
  const sides = new Map<string, { model: string; isList: boolean }[]>();

  for (const model of Prisma.dmmf.datamodel.models) {
    for (const field of model.fields) {
      if (field.kind !== 'object' || !field.relationName) continue;
      const list = sides.get(field.relationName) ?? [];
      list.push({ model: model.name, isList: field.isList });
      sides.set(field.relationName, list);
    }
  }

  return [...sides.entries()]
    .filter(([, ends]) => ends.length === 2 && ends.every((e) => e.isList))
    .map(([relation]) => `_${relation}`);
}

test('every model in the schema is backed up', () => {
  const expected = Prisma.dmmf.datamodel.models.map((m) => delegateFor(m.name)).sort();
  const covered: string[] = [...TABLES].sort();

  const missing = expected.filter((m) => !covered.includes(m));
  assert.deepEqual(
    missing,
    [],
    `not backed up: ${missing.join(', ')} — add to TABLES in src/lib/backup-tables.ts, ` +
      'after the tables they point at',
  );
});

test('TABLES names nothing the schema no longer has', () => {
  const real = new Set<string>(Prisma.dmmf.datamodel.models.map((m) => delegateFor(m.name)));
  const stale = (TABLES as readonly string[]).filter((t) => !real.has(t));
  assert.deepEqual(stale, [], `no such model: ${stale.join(', ')}`);
});

test('every implicit join table is backed up', () => {
  const expected = implicitJoinTables().sort();
  const covered = JOIN_TABLES.map((j) => j.table).sort();

  assert.deepEqual(
    covered,
    expected,
    'JOIN_TABLES is out of step with the schema. Prisma generates no model for ' +
      'an implicit many-to-many, so the loop over TABLES cannot see it and it ' +
      'goes missing silently.',
  );
});

/**
 * Optional foreign keys count.
 *
 * An earlier version of this test waved them through, on the reasoning that a
 * nullable column need not be satisfied. That is only true when the column is
 * null. `User.employeeId` is optional and always set in practice, `user` was
 * restored before `employee`, and so every user failed on the way in — taking
 * the sales that reference them, and the journal that references those. The
 * exemption hid the single worst bug in the restore path, so there isn't one.
 */
test('TABLES is in dependency order — no child before its parent', () => {
  const position = new Map<string, number>(TABLES.map((t, i) => [t, i]));

  for (const model of Prisma.dmmf.datamodel.models) {
    const child = delegateFor(model.name);
    const childAt = position.get(child);
    if (childAt === undefined) continue;

    for (const field of model.fields) {
      // The side holding the foreign key is the one with `relationFromFields`.
      if (field.kind !== 'object' || !field.relationFromFields?.length) continue;

      const parent = delegateFor(field.type);
      if (parent === child) continue; // self-reference: same INSERT, fine

      const parentAt = position.get(parent);
      if (parentAt === undefined) continue;

      assert.ok(
        parentAt < childAt,
        `${child} is restored before ${parent}, which it points at ` +
          `(${child}.${field.name}${field.isRequired ? '' : ', optional — but still set in practice'}). ` +
          `Move ${parent} earlier in TABLES.`,
      );
    }
  }
});
