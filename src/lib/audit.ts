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
  /** Voids, refunds, discounts over threshold, price changes, deletions. */
  sensitive?: boolean;
  branchId?: string | null;
};

/**
 * Append-only. Every create / edit / void / status change on a business record
 * goes through here. Nothing in the app ever updates or deletes AuditLog rows.
 */
export async function audit(user: SessionUser | null, input: AuditInput): Promise<void> {
  let ip = '';
  let userAgent = '';
  try {
    const meta = await requestMeta();
    ip = meta.ip;
    userAgent = meta.userAgent;
  } catch {
    // Outside a request context (cron jobs, seed) — leave blank.
  }

  await prisma.auditLog.create({
    data: {
      userId: user?.id ?? null,
      userName: user?.name ?? 'system',
      role: user?.role ?? 'SYSTEM',
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

/** Shallow diff helper so audit payloads stay small and readable. */
export function diff<T extends Record<string, unknown>>(
  before: T | null,
  after: T | null,
  keys?: (keyof T)[],
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  const all = new Set<string>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
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
