import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, visibleModules, PERMISSIONS } from '../src/lib/rbac';

test('the receptionist cannot reach money, payroll or full reports', () => {
  const denied = [
    'dashboard.financials',
    'finance.view',
    'finance.approve',
    'finance.void',
    'payroll.view',
    'payroll.finalize',
    'payroll.ownerOnlyPay',
    'incentives.view',
    'reports.view',
    'pos.void',
    'pos.discountOverride',
    'users.manage',
    'audit.view',
    'branches.manage',
    'settings.edit',
    'settings.critical',
    'employees.govNumbers',
    'employees.loans',
    'purchasing.approve',
  ] as const;

  for (const permission of denied) {
    assert.equal(
      can('RECEPTIONIST', permission),
      false,
      `receptionist must not have ${permission}`,
    );
  }
});

test('the receptionist keeps everything she needs for the front desk', () => {
  const allowed = [
    'dashboard.view',
    'clients.view',
    'clients.edit',
    'clients.medical',
    'appointments.view',
    'appointments.edit',
    'pos.use',
    'pettycash.log',
    'eod.close',
    'employees.attendance',
    'inventory.view',
    'inventory.usage',
    'finance.submitExpense',
    'reports.ownDailySummary',
    'messages.use',
    'shiftnotes.write',
  ] as const;

  for (const permission of allowed) {
    assert.equal(can('RECEPTIONIST', permission), true, `receptionist needs ${permission}`);
  }
});

test('the manager runs the business but cannot delete finance, manage users or see incentives', () => {
  // Explicitly withheld by the spec.
  assert.equal(can('ADMIN', 'finance.void'), false, 'cannot delete financial records');
  assert.equal(can('ADMIN', 'users.manage'), false, 'cannot manage accounts');
  assert.equal(can('ADMIN', 'settings.critical'), false, 'cannot change critical settings');
  assert.equal(can('ADMIN', 'incentives.view'), false, 'incentives are Owner-only');
  assert.equal(can('ADMIN', 'payroll.ownerOnlyPay'), false, 'cannot see Receptionist/Manager pay');
  assert.equal(can('ADMIN', 'audit.view'), false, 'audit log is Owner-only');
  assert.equal(can('ADMIN', 'branches.manage'), false);

  // Granted by the spec.
  assert.equal(can('ADMIN', 'pos.void'), true, 'can approve voids and refunds');
  assert.equal(can('ADMIN', 'purchasing.approve'), true, 'can approve purchase orders');
  assert.equal(can('ADMIN', 'finance.view'), true);
  assert.equal(can('ADMIN', 'payroll.finalize'), true, 'can run therapist payroll');
  assert.equal(can('ADMIN', 'reports.view'), true);
});

test('the owner has every permission', () => {
  for (const permission of PERMISSIONS) {
    assert.equal(can('OWNER', permission), true, `owner should have ${permission}`);
  }
});

test('navigation matches the role', () => {
  const receptionist = visibleModules('RECEPTIONIST').map((m) => m.key);
  assert.ok(!receptionist.includes('settings'), 'no Settings in the receptionist nav');
  assert.ok(receptionist.includes('sales'), 'POS is front and centre');
  assert.ok(receptionist.includes('appointments'));

  const owner = visibleModules('OWNER').map((m) => m.key);
  assert.equal(owner.length, 10, 'the Owner sees all ten modules');
});
