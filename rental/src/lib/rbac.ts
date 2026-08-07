import type { Role } from '@prisma/client';

/**
 * The single source of truth for authorization. Every page, server action and
 * endpoint checks against this map; the UI only ever *hides* what the server
 * already refuses, and tests/live/rbac-live.ts proves that over real HTTP.
 *
 * A permission answers "what kind of thing may you do". It does not answer
 * "whose record is it" — that is the second gate, in scope.ts. A cleaner holds
 * `tasks.complete`; that is not permission to complete anyone's task.
 */
export const PERMISSIONS = [
  'dashboard.view',
  'dashboard.financials',

  'properties.view',
  'properties.edit',
  'properties.create',

  'calendar.view',
  'calendar.block',

  'reservations.view',
  'reservations.edit',
  'reservations.cancel',
  'reservations.checkin',

  'guests.view',
  'guests.edit',
  'guests.merge',
  'messages.send',

  'tasks.view',
  'tasks.assign',
  'tasks.complete',

  'cleaning.view',
  'cleaning.manage',
  'inspection.perform',

  'maintenance.view',
  'maintenance.edit',
  'maintenance.cost',

  'incidents.view',
  'incidents.edit',

  'inventory.view',
  'inventory.edit',
  'inventory.consume',

  'finance.view',
  'finance.submitExpense',
  'finance.edit',
  'finance.refund',
  'finance.export',

  'reports.view',

  'reviews.view',
  'reviews.respond',

  'marketing.view',
  'marketing.edit',

  'documents.view',
  'documents.edit',

  'settings.view',
  'settings.edit',
  'settings.critical',
  'users.manage',
  'branches.manage',
  'audit.view',
  'sync.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Field roles. Their `tasks.*` grants are narrowed to their own assignments by
 * scopeToAssignee(); nothing they hold is portfolio-wide.
 */
const CLEANER: Permission[] = [
  'tasks.view',
  'tasks.complete',
  'cleaning.view',
  'inventory.consume',
  'incidents.edit', // reporting damage found mid-clean
];

const INSPECTOR: Permission[] = [
  'tasks.view',
  'tasks.complete',
  'cleaning.view',
  'inspection.perform',
  'incidents.edit',
];

const MAINTENANCE: Permission[] = [
  'tasks.view',
  'tasks.complete',
  'maintenance.view',
  'maintenance.edit',
  'inventory.consume',
];

/** Books and nothing else. Read-only everywhere outside finance. */
const ACCOUNTANT: Permission[] = [
  'dashboard.view',
  'dashboard.financials',
  'properties.view',
  'reservations.view',
  'tasks.view',
  'cleaning.view',
  'maintenance.view',
  'maintenance.cost',
  'incidents.view',
  'inventory.view',
  'finance.view',
  'finance.submitExpense',
  'finance.edit',
  'finance.export',
  'reports.view',
  'documents.view',
  'documents.edit',
];

/**
 * The front desk. Everything a booking needs, and no view of the P&L — they
 * must be able to tell a guest what is owed, not what the business earns.
 */
const RESERVATIONS: Permission[] = [
  'dashboard.view',
  'properties.view',
  'calendar.view',
  'calendar.block',
  'reservations.view',
  'reservations.edit',
  'reservations.cancel',
  'reservations.checkin',
  'guests.view',
  'guests.edit',
  'messages.send',
  'cleaning.view',
  'maintenance.view',
  'incidents.view',
  'incidents.edit',
  'reviews.view',
  'marketing.view',
];

const MANAGER: Permission[] = [
  ...RESERVATIONS,
  'dashboard.financials',
  'properties.edit',
  'guests.merge',
  'tasks.view',
  'tasks.assign',
  'tasks.complete',
  'cleaning.manage',
  'inspection.perform',
  'maintenance.edit',
  'maintenance.cost',
  'inventory.view',
  'inventory.edit',
  'inventory.consume',
  'finance.view',
  'finance.submitExpense',
  'finance.refund',
  'finance.export',
  'reports.view',
  'reviews.respond',
  'marketing.edit',
  'documents.view',
  'documents.edit',
  'settings.view',
  'settings.edit',
  'sync.manage',
];

const OWNER: Permission[] = [...PERMISSIONS];

const MATRIX: Record<Role, Set<Permission>> = {
  OWNER: new Set(OWNER),
  MANAGER: new Set(MANAGER),
  RESERVATIONS: new Set(RESERVATIONS),
  ACCOUNTANT: new Set(ACCOUNTANT),
  CLEANER: new Set(CLEANER),
  INSPECTOR: new Set(INSPECTOR),
  MAINTENANCE: new Set(MAINTENANCE),
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.has(permission) ?? false;
}

export function canAny(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export function permissionsFor(role: Role): Permission[] {
  return [...(MATRIX[role] ?? [])];
}

/** The three roles whose whole world is the tasks assigned to them. */
export const FIELD_ROLES: Role[] = ['CLEANER', 'INSPECTOR', 'MAINTENANCE'];

export function isFieldRole(role: Role): boolean {
  return FIELD_ROLES.includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Property manager',
  RESERVATIONS: 'Reservations',
  ACCOUNTANT: 'Accountant',
  CLEANER: 'Cleaner',
  INSPECTOR: 'Inspector',
  MAINTENANCE: 'Maintenance',
};

/**
 * Portal navigation. A field role gets a four-item phone layout, not a shrunken
 * owner dashboard, which is why `fieldOnly` exists.
 */
export const MODULES = [
  { key: 'dashboard', label: 'Dashboard', href: '/portal', icon: '◧', permission: 'dashboard.view' },
  { key: 'calendar', label: 'Calendar', href: '/portal/calendar', icon: '▦', permission: 'calendar.view' },
  { key: 'reservations', label: 'Reservations', href: '/portal/reservations', icon: '✦', permission: 'reservations.view' },
  { key: 'guests', label: 'Guests', href: '/portal/guests', icon: '☺', permission: 'guests.view' },
  { key: 'tasks', label: 'Tasks', href: '/portal/tasks', icon: '☑', permission: 'tasks.view' },
  { key: 'cleaning', label: 'Turnovers', href: '/portal/cleaning', icon: '❖', permission: 'cleaning.manage' },
  { key: 'maintenance', label: 'Maintenance', href: '/portal/maintenance', icon: '⚒', permission: 'maintenance.view' },
  { key: 'inventory', label: 'Inventory', href: '/portal/inventory', icon: '▤', permission: 'inventory.view' },
  { key: 'finance', label: 'Finance', href: '/portal/finance', icon: '₱', permission: 'finance.view' },
  { key: 'reports', label: 'Reports', href: '/portal/reports', icon: '◪', permission: 'reports.view' },
  { key: 'marketing', label: 'Marketing', href: '/portal/marketing', icon: '◑', permission: 'marketing.view' },
  { key: 'properties', label: 'Properties', href: '/portal/properties', icon: '⌂', permission: 'properties.view' },
  { key: 'settings', label: 'Settings', href: '/portal/settings', icon: '⚙', permission: 'settings.view' },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  href: string;
  icon: string;
  permission: Permission;
}>;

export function visibleModules(role: Role) {
  if (isFieldRole(role)) {
    return MODULES.filter((m) => m.key === 'tasks');
  }
  return MODULES.filter((m) => can(role, m.permission));
}
