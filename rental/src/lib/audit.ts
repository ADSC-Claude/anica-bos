import 'server-only';
import { prisma } from './db';
import { requestMeta, type SessionUser } from './auth';

export type AuditInput = {
  module: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
  /** Cancellations, refunds, price changes, deletions, permission changes. */
  sensitive?: boolean;
  propertyId?: string | null;
  branchId?: string | null;
};

/**
 * Append-only. Every create, edit, cancellation, refund and incident goes
 * through here. Nothing in the application ever updates or deletes a row.
 */
export async function audit(user: SessionUser | null, input: AuditInput): Promise<void> {
  let ip = '';
  let userAgent = '';
  try {
    const meta = await requestMeta();
    ip = meta.ip;
    userAgent = meta.userAgent;
  } catch {
    // Outside a request context — cron jobs, the seed. Leave blank.
  }

  await prisma.auditLog.create({
    data: {
      userId: user?.id ?? null,
      userName: user?.name ?? 'system',
      role: user?.role ?? 'SYSTEM',
      propertyId: input.propertyId ?? null,
      branchId: input.branchId ?? user?.branchId ?? null,
      module: input.module,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? '',
      summary: input.summary ?? '',
      before: (input.before ?? undefined) as never,
      after: (input.after ?? undefined) as never,
      sensitive: input.sensitive ?? false,
      ip,
      userAgent,
    },
  });
}

/**
 * Shallow diff, so an audit payload is the fields that actually changed rather
 * than two copies of a row. Reading "which of these forty columns moved" off a
 * full snapshot is the reason audit logs go unread.
 */
export function diff<T extends Record<string, unknown>>(
  before: T | null,
  after: T | null,
  keys?: (keyof T)[],
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  const all = new Set<string>([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of all) {
    if (keys && !keys.includes(k as keyof T)) continue;
    const bv = before?.[k as keyof T];
    const av = after?.[k as keyof T];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      b[k as keyof T] = bv as T[keyof T];
      a[k as keyof T] = av as T[keyof T];
    }
  }
  return { before: b, after: a };
}
