import { requireUser } from '@/lib/guard';
import { exportPersonalData } from '@/lib/privacy';
import { audit } from '@/lib/audit';

/**
 * The right of access, as a file. JSON rather than a rendered page because the
 * point is that it is complete and machine-readable — including the guest
 * lists, which are the part a person is most likely to actually want back.
 */
export async function GET() {
  const user = await requireUser();
  const data = await exportPersonalData(user.id);
  await audit(user, { module: 'privacy', action: 'export', entityType: 'User', entityId: user.id, summary: 'Downloaded their own data' });

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
