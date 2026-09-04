import type { Role } from '@prisma/client';

/**
 * The single source of truth for what staff may do. Every admin page, server
 * action and endpoint checks against this map; the UI only ever *hides* what
 * the server already refuses.
 *
 * A customer holds no permission at all. Their authority is ownership: an
 * invitation, order or guest list is theirs or it is not, and that is checked
 * per record in guard.ts, never here.
 */
export const PERMISSIONS = [
  'admin.dashboard',

  'orders.view',
  'orders.edit',
  'payments.review',
  'payments.refund',

  'dfy.view',
  'dfy.edit',
  'dfy.assign',

  'templates.view',
  'templates.edit',

  'customers.view',
  'customers.edit',

  'invitations.view',
  'invitations.edit',

  'coupons.manage',

  'support.view',
  'support.reply',

  'reports.view',

  'settings.view',
  'settings.edit',
  'users.manage',
  'audit.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Builds invitations for DFY customers. No money, no settings. */
const ENCODER: Permission[] = [
  'admin.dashboard',
  'dfy.view',
  'dfy.edit',
  'templates.view',
  'templates.edit',
  'invitations.view',
  'invitations.edit',
  'customers.view',
  'support.view',
  'support.reply',
];

/**
 * Support and finance. Verifies proof-of-payment screenshots, answers
 * Messenger, issues refunds, reads the numbers. Does not build invitations
 * for customers and does not change prices.
 */
const SUPPORT: Permission[] = [
  'admin.dashboard',
  'orders.view',
  'orders.edit',
  'payments.review',
  'payments.refund',
  'dfy.view',
  'dfy.assign',
  'templates.view',
  'customers.view',
  'customers.edit',
  'invitations.view',
  'invitations.edit',
  'coupons.manage',
  'support.view',
  'support.reply',
  'reports.view',
];

const ADMIN: Permission[] = [...PERMISSIONS];

const MATRIX: Record<Role, Set<Permission>> = {
  ADMIN: new Set(ADMIN),
  ENCODER: new Set(ENCODER),
  SUPPORT: new Set(SUPPORT),
  CUSTOMER: new Set(),
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

export const STAFF_ROLES: Role[] = ['ADMIN', 'ENCODER', 'SUPPORT'];

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Owner / Admin',
  ENCODER: 'Encoder / Designer',
  SUPPORT: 'Support / Finance',
  CUSTOMER: 'Customer',
};

export const ADMIN_MODULES = [
  { key: 'dashboard', label: 'Overview', href: '/admin', icon: '◧', permission: 'admin.dashboard' },
  { key: 'orders', label: 'Orders', href: '/admin/orders', icon: '▤', permission: 'orders.view' },
  { key: 'payments', label: 'Payments', href: '/admin/payments', icon: '₱', permission: 'payments.review' },
  { key: 'dfy', label: 'DFY queue', href: '/admin/dfy', icon: '❖', permission: 'dfy.view' },
  { key: 'invitations', label: 'Invitations', href: '/admin/invitations', icon: '✉', permission: 'invitations.view' },
  { key: 'templates', label: 'Templates', href: '/admin/templates', icon: '▦', permission: 'templates.view' },
  { key: 'customers', label: 'Customers', href: '/admin/customers', icon: '☺', permission: 'customers.view' },
  { key: 'coupons', label: 'Coupons', href: '/admin/coupons', icon: '✂', permission: 'coupons.manage' },
  { key: 'support', label: 'Support', href: '/admin/support', icon: '✆', permission: 'support.view' },
  { key: 'reports', label: 'Reports', href: '/admin/reports', icon: '◪', permission: 'reports.view' },
  { key: 'settings', label: 'Settings', href: '/admin/settings', icon: '⚙', permission: 'settings.view' },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  href: string;
  icon: string;
  permission: Permission;
}>;

export function visibleModules(role: Role) {
  return ADMIN_MODULES.filter((m) => can(role, m.permission));
}
