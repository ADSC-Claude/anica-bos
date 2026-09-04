import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { occasionLabel } from '@/lib/occasions';
import { paletteFrom } from '@/lib/theme';
import { PageHeader, Pill } from '@/components/ui';
import { Flash, type FlashParams } from '../flash';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const user = await requireStaffPage('templates.view');
  const sp = await searchParams;
  const templates = await prisma.template.findMany({ orderBy: [{ occasion: 'asc' }, { sortOrder: 'asc' }], include: { _count: { select: { invitations: true } } } });
  return (
    <>
      <PageHeader title="Templates" subtitle={`${templates.length} designs`} actions={can(user.role, 'templates.edit') && <Link href="/admin/templates/new" className="btn btn-primary btn-sm">+ New template</Link>} />
      <Flash {...sp} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {templates.map((t) => {
          const pal = paletteFrom(t.palette);
          return (
            <Link key={t.id} href={`/admin/templates/${t.id}`} className="card overflow-hidden text-sm hover:bg-[color:var(--color-sand-100)]">
              <div className="aspect-[4/3]" style={{ background: t.thumbnailUrl ? `center/cover url(${t.thumbnailUrl})` : `linear-gradient(160deg, ${pal.bg}, ${pal.accent2})` }} />
              <div className="p-3">
                <p className="font-semibold">{t.name} {t.featured && <Pill tone="info">Featured</Pill>} {!t.published && <Pill tone="warn">Unpublished</Pill>}</p>
                <p className="text-xs text-[color:var(--color-ink-500)]">{occasionLabel(t.occasion)} · {t.premium ? 'Premium' : t.minTier} · {t.layout} · used {t._count.invitations}×</p>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
