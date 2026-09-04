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
  /** Refunds, payment approvals, price changes, deletions, role changes. */
  sensitive?: boolean;
};

/** Append-only. Nothing in the application ever updates or deletes a row. */
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
