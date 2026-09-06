import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Role } from '@prisma/client';
import { can, permissionsFor, visibleModules, isStaff, PERMISSIONS } from '../src/lib/rbac';

const STAFF: Role[] = ['ADMIN', 'ENCODER', 'SUPPORT'];

test('the admin holds everything, nobody else does', () => {
  for (const p of PERMISSIONS) assert.equal(can('ADMIN', p), true, p);
  for (const r of STAFF.filter((x) => x !== 'ADMIN')) assert.ok(permissionsFor(r).length < PERMISSIONS.length, r);
});

test('a customer holds no permission at all', () => {
  assert.equal(isStaff('CUSTOMER'), false);
  assert.equal(permissionsFor('CUSTOMER').length, 0);
  assert.equal(visibleModules('CUSTOMER').length, 0);
});

test('encoders build but never touch money or settings', () => {
  assert.equal(can('ENCODER', 'dfy.edit'), true);
  assert.equal(can('ENCODER', 'invitations.edit'), true);
  assert.equal(can('ENCODER', 'templates.edit'), true);
  assert.equal(can('ENCODER', 'payments.review'), false);
  assert.equal(can('ENCODER', 'payments.refund'), false);
  assert.equal(can('ENCODER', 'settings.edit'), false);
  assert.equal(can('ENCODER', 'reports.view'), false);
  assert.equal(can('ENCODER', 'users.manage'), false);
});

test('support verifies payments and answers customers but does not change prices', () => {
  assert.equal(can('SUPPORT', 'payments.review'), true);
  assert.equal(can('SUPPORT', 'payments.refund'), true);
  assert.equal(can('SUPPORT', 'support.reply'), true);
  assert.equal(can('SUPPORT', 'dfy.assign'), true);
  assert.equal(can('SUPPORT', 'dfy.edit'), false, 'support does not encode');
  assert.equal(can('SUPPORT', 'settings.edit'), false);
  assert.equal(can('SUPPORT', 'templates.edit'), false);
  assert.equal(can('SUPPORT', 'users.manage'), false);
});

test('navigation only shows what the server would allow', () => {
  for (const r of STAFF) for (const m of visibleModules(r)) assert.equal(can(r, m.permission), true, `${r} ${m.key}`);
});
