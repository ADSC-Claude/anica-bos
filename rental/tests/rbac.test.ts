import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Role } from '@prisma/client';
import { can, permissionsFor, visibleModules, isFieldRole, PERMISSIONS } from '../src/lib/rbac';

/**
 * The permission matrix from docs/03-roles-and-permissions.md, asserted.
 *
 * This covers the "what may you do" gate only. The "whose record is it" gate —
 * property and assignee scope — is server-side in guard.ts and is exercised
 * over real HTTP by tests/live/rbac-live.ts.
 */

const ROLES: Role[] = ['OWNER', 'MANAGER', 'RESERVATIONS', 'ACCOUNTANT', 'CLEANER', 'INSPECTOR', 'MAINTENANCE'];

test('the owner holds everything, and nobody else does', () => {
  for (const p of PERMISSIONS) assert.equal(can('OWNER', p), true, `owner should hold ${p}`);
  for (const role of ROLES.filter((r) => r !== 'OWNER')) {
    assert.ok(
      permissionsFor(role).length < PERMISSIONS.length,
      `${role} must not hold every permission`,
    );
  }
});

test('money is walled off from the front desk', () => {
  assert.equal(can('RESERVATIONS', 'finance.view'), false);
  assert.equal(can('RESERVATIONS', 'dashboard.financials'), false);
  assert.equal(can('RESERVATIONS', 'reports.view'), false);
  // But they can still take a booking and tell a guest what is owed.
  assert.equal(can('RESERVATIONS', 'reservations.edit'), true);
  assert.equal(can('RESERVATIONS', 'reservations.view'), true);
});

test('the accountant reads operations and writes only the books', () => {
  assert.equal(can('ACCOUNTANT', 'finance.edit'), true);
  assert.equal(can('ACCOUNTANT', 'reports.view'), true);
  assert.equal(can('ACCOUNTANT', 'reservations.view'), true);
  assert.equal(can('ACCOUNTANT', 'reservations.edit'), false, 'must not be able to change a stay');
  assert.equal(can('ACCOUNTANT', 'calendar.block'), false);
  assert.equal(can('ACCOUNTANT', 'tasks.assign'), false);
});

test('field roles see their work and nothing else', () => {
  for (const role of ['CLEANER', 'INSPECTOR', 'MAINTENANCE'] as Role[]) {
    assert.equal(isFieldRole(role), true);
    assert.equal(can(role, 'tasks.view'), true);
    assert.equal(can(role, 'tasks.complete'), true);

    // The whole point of least privilege here:
    assert.equal(can(role, 'finance.view'), false, `${role} must not see finance`);
    assert.equal(can(role, 'reservations.view'), false, `${role} must not browse bookings`);
    assert.equal(can(role, 'guests.view'), false, `${role} must not browse guests`);
    assert.equal(can(role, 'dashboard.view'), false, `${role} has no dashboard`);
    assert.equal(can(role, 'settings.view'), false);
    assert.equal(can(role, 'reports.view'), false);
    assert.equal(can(role, 'tasks.assign'), false, `${role} must not reassign work`);

    // And their navigation is one item, not a shrunken owner dashboard.
    const modules = visibleModules(role);
    assert.equal(modules.length, 1);
    assert.equal(modules[0].key, 'tasks');
  }
});

test('a cleaner may consume stock but not browse or edit it', () => {
  assert.equal(can('CLEANER', 'inventory.consume'), true, 'restocking during a clean moves stock');
  assert.equal(can('CLEANER', 'inventory.view'), false);
  assert.equal(can('CLEANER', 'inventory.edit'), false);
});

test('only the inspector and above may pass an inspection', () => {
  assert.equal(can('INSPECTOR', 'inspection.perform'), true);
  assert.equal(can('MANAGER', 'inspection.perform'), true);
  assert.equal(can('OWNER', 'inspection.perform'), true);
  assert.equal(can('CLEANER', 'inspection.perform'), false, 'a cleaner must not sign off their own work');
  assert.equal(can('MAINTENANCE', 'inspection.perform'), false);
});

test('the owner alone holds the dangerous controls', () => {
  for (const permission of ['users.manage', 'branches.manage', 'audit.view', 'settings.critical', 'properties.create'] as const) {
    for (const role of ROLES.filter((r) => r !== 'OWNER')) {
      assert.equal(can(role, permission), false, `${role} must not hold ${permission}`);
    }
  }
});

test('a manager runs the business but cannot rewrite who has access', () => {
  assert.equal(can('MANAGER', 'properties.edit'), true);
  assert.equal(can('MANAGER', 'finance.refund'), true);
  assert.equal(can('MANAGER', 'settings.edit'), true);
  assert.equal(can('MANAGER', 'users.manage'), false);
  assert.equal(can('MANAGER', 'audit.view'), false);
  assert.equal(can('MANAGER', 'properties.create'), false);
});

test('every permission in the list is reachable by someone', () => {
  for (const p of PERMISSIONS) {
    assert.ok(ROLES.some((r) => can(r, p)), `${p} is granted to nobody — dead permission`);
  }
});

test('an unknown role is refused everything', () => {
  assert.equal(can('NOT_A_ROLE' as Role, 'dashboard.view'), false);
  assert.deepEqual(permissionsFor('NOT_A_ROLE' as Role), []);
});
