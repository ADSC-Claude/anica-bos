import type { Role } from '@prisma/client';

/**
 * Single source of truth for authorization. Every server route and action
 * checks against this map — the UI only ever *hides* what the server already
 * refuses.
 */
export const PERMISSIONS = [
  // dashboard
  'dashboard.view',
  'dashboard.financials', // revenue / expense / profit figures

  // clients
  'clients.view',
  'clients.edit',
  'clients.merge',
  'clients.medical',
  /** Carrying out an RA 10173 erasure request. Owner only — see erasure.ts. */
  'clients.erase',
  'corporate.view',
  'corporate.manage',
  'partners.view',
  'partners.manage',

  // appointments
  'appointments.view',
  'appointments.edit',

  // sales / POS
  'pos.use',
  'pos.void', // requires approval PIN as well
  'pos.discountOverride',
  'pettycash.log',
  'pettycash.manage',
  'eod.close',

  // employees
  'employees.view',
  'employees.edit',
  'employees.attendance',
  'employees.govNumbers',
  'employees.loans',
  'payroll.view',
  'payroll.finalize',
  'payroll.ownerOnlyPay', // Receptionist/Manager pay structure & payslips
  'incentives.view', // Owner only, never released via payroll

  // inventory
  'inventory.view',
  'inventory.edit',
  'inventory.usage',
  'purchasing.view',
  'purchasing.approve',

  // finance
  'finance.view',
  'finance.submitExpense',
  'finance.approve',
  'finance.void',
  'finance.export',

  // marketing
  'marketing.view',
  'marketing.edit',

  // reports
  'reports.view',
  'reports.ownDailySummary',

  // settings / admin
  'settings.view',
  'settings.edit',
  'settings.critical',
  'users.manage',
  'audit.view',
  'branches.manage',

  // comms
  'messages.use',
  'announcements.post',
  'shiftnotes.write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const RECEPTIONIST: Permission[] = [
  'dashboard.view',
  'clients.view',
  'clients.edit',
  /**
   * Deliberate, and the one grant here worth defending out loud.
   *
   * The receptionist is who takes the booking, and the allergy has to be known
   * before the treatment is assigned, not after. Withholding it would mean a
   * permission escalated several times a day, which in a spa means one manager
   * account left signed in at the desk — worse for the client than the access
   * it was meant to prevent.
   *
   * So the protection is not the permission, it is `recordMedicalAccess`: every
   * health record opened is written to the audit log against the person who
   * opened it. See src/lib/medical.ts.
   */
  'clients.medical',
  'corporate.view',
  'partners.view',
  'appointments.view',
  'appointments.edit',
  'pos.use',
  'pettycash.log',
  'eod.close',
  'employees.attendance',
  'inventory.view',
  'inventory.usage',
  'finance.submitExpense',
  'marketing.view',
  'reports.ownDailySummary',
  'messages.use',
  'shiftnotes.write',
];

const ADMIN: Permission[] = [
  ...RECEPTIONIST,
  'dashboard.financials',
  'clients.merge',
  'corporate.manage',
  'partners.manage',
  'pos.void',
  'pos.discountOverride',
  'pettycash.manage',
  'employees.view',
  'employees.edit',
  'employees.govNumbers',
  'employees.loans',
  'payroll.view',
  'payroll.finalize',
  'inventory.edit',
  'purchasing.view',
  'purchasing.approve',
  'finance.view',
  'finance.approve',
  'finance.export',
  'marketing.edit',
  'reports.view',
  'settings.view',
  'settings.edit',
  'announcements.post',
];

// Owner has everything.
const OWNER: Permission[] = [...PERMISSIONS];

const MATRIX: Record<Role, Set<Permission>> = {
  OWNER: new Set(OWNER),
  ADMIN: new Set(ADMIN),
  RECEPTIONIST: new Set(RECEPTIONIST),
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.has(permission) ?? false;
}

export function canAny(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export function permissionsFor(role: Role): Permission[] {
  return [...MATRIX[role]];
}

/** Modules visible in the portal navigation, per role. */
export const MODULES = [
  { key: 'dashboard', label: 'Dashboard', href: '/portal', icon: '◧', permission: 'dashboard.view' },
  { key: 'clients', label: 'Clients', href: '/portal/clients', icon: '☺', permission: 'clients.view' },
  { key: 'appointments', label: 'Appointments', href: '/portal/appointments', icon: '▦', permission: 'appointments.view' },
  { key: 'sales', label: 'Sales', href: '/portal/sales', icon: '₱', permission: 'pos.use' },
  { key: 'employees', label: 'Employees', href: '/portal/employees', icon: '⚇', permission: 'employees.attendance' },
  { key: 'inventory', label: 'Inventory', href: '/portal/inventory', icon: '▤', permission: 'inventory.view' },
  { key: 'finance', label: 'Finance', href: '/portal/finance', icon: '◔', permission: 'finance.submitExpense' },
  { key: 'marketing', label: 'Marketing', href: '/portal/marketing', icon: '✦', permission: 'marketing.view' },
  { key: 'reports', label: 'Reports', href: '/portal/reports', icon: '◪', permission: 'reports.ownDailySummary' },
  { key: 'settings', label: 'Settings', href: '/portal/settings', icon: '⚙', permission: 'settings.view' },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  href: string;
  icon: string;
  permission: Permission;
}>;

export function visibleModules(role: Role) {
  return MODULES.filter((m) => can(role, m.permission));
}
