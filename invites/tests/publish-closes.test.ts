import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNotPublished } from '../src/lib/invitations';
import type { SessionUser } from '../src/lib/auth';

const as = (role: SessionUser['role']): SessionUser => ({ id: 'u1', email: 'a@b.c', name: 'A', role, mustChangePassword: false });

test('publishing closes an invitation to its customer, and to nobody else', () => {
  // Revisions are rounds of changes before we publish. After it, a save would
  // land live on a guest's phone mid-edit, so the customer asks and we change
  // it — which only works if staff are not gated by the same rule.
  assert.throws(() => assertNotPublished(as('CUSTOMER'), { status: 'PUBLISHED' }), /already live/);
  assert.doesNotThrow(() => assertNotPublished(as('CUSTOMER'), { status: 'DRAFT' }), 'a draft is theirs to fill in');
  for (const role of ['ADMIN', 'ENCODER', 'SUPPORT'] as const) {
    assert.doesNotThrow(() => assertNotPublished(as(role), { status: 'PUBLISHED' }), `${role} makes the change when asked`);
  }
});
