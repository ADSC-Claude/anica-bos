import { handle, requireApi } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { csvResponse } from '@/lib/csv';
import { formatManila } from '@/lib/datetime';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Owner-only export of the append-only audit trail. */
export const GET = handle(async () => {
  const user = await requireApi('audit.view');
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20000,
  });

  await audit(user, {
    module: 'settings',
    action: 'export_audit_log',
    entityType: 'AuditLog',
    summary: `Exported ${entries.length} audit entries`,
    sensitive: true,
  });

  return csvResponse(
    'audit-log.csv',
    ['When', 'User', 'Role', 'Module', 'Action', 'Entity', 'Entity ID', 'Summary', 'Sensitive', 'Before', 'After', 'IP', 'Device'],
    entries.map((e) => [
      formatManila(e.createdAt, { time: true }),
      e.userName, e.role, e.module, e.action, e.entityType, e.entityId, e.summary,
      e.sensitive ? 'yes' : 'no',
      e.before ? JSON.stringify(e.before) : '',
      e.after ? JSON.stringify(e.after) : '',
      e.ip, e.userAgent,
    ]),
  );
});
