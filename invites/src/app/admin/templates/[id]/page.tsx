import { notFound } from 'next/navigation';
import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { OCCASIONS } from '@/lib/occasions';
import { TIERS } from '@/lib/tiers';
import { LAYOUTS, PALETTE_PRESETS, FONT_PRESETS, paletteFrom } from '@/lib/theme';
import { OCCASION_SECTIONS, SECTION_BY_KEY } from '@/lib/sections';
import { PageHeader, BackLink, Field, TextArea, Select, Checkbox } from '@/components/ui';
import { Flash, type FlashParams } from '../../flash';
import { saveTemplateAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function TemplateEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  await requireStaffPage('templates.edit');
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === 'new';
  const t = isNew ? null : await prisma.template.findUnique({ where: { id } });
  if (!isNew && !t) notFound();
  const pal = paletteFrom(t?.palette);
  const occasion = t?.occasion ?? 'WEDDING';
  const fontsKey = FONT_PRESETS.find((f) => JSON.stringify(f.fonts) === JSON.stringify(t?.fonts))?.key ?? 'serif';
  return (
    <>
      <BackLink href="/admin/templates">Templates</BackLink>
      <PageHeader title={isNew ? 'New template' : t!.name} subtitle="A template is a layout, a palette and fonts. Content never lives here." />
      <Flash {...sp} />
      <form action={saveTemplateAction.bind(null, t?.id ?? null, isNew ? '/admin/templates/new' : `/admin/templates/${id}`)} className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 p-4">
          <Field label="Name" name="name" defaultValue={t?.name} required />
          <Field label="Slug" name="slug" defaultValue={t?.slug} hint="Lowercase, dashes. Used in URLs and the gallery." />
          <Select label="Occasion" name="occasion" defaultValue={occasion} options={OCCASIONS.map((o) => ({ value: o.key, label: o.label }))} hint="Changing the occasion changes which sections apply — save, then tick sections again." />
          <Select label="Lowest tier" name="minTier" defaultValue={t?.minTier ?? 'BASIC'} options={TIERS.map((x) => ({ value: x, label: x }))} />
          <Checkbox label="Premium (Complete tier only)" name="premium" defaultChecked={t?.premium} />
          <TextArea label="Description" name="description" defaultValue={t?.description} rows={2} />
          <Field label="Thumbnail URL" name="thumbnailUrl" defaultValue={t?.thumbnailUrl} hint="Portrait image shown in the gallery. Leave blank to show the palette." />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Sort order" name="sortOrder" type="number" defaultValue={t?.sortOrder ?? 0} />
            <div className="pt-6"><Checkbox label="Featured" name="featured" defaultChecked={t?.featured} /></div>
            <div className="pt-6"><Checkbox label="Published" name="published" defaultChecked={t?.published ?? true} /></div>
          </div>
        </div>
        <div className="card space-y-3 p-4">
          <Select label="Layout" name="layout" defaultValue={t?.layout ?? 'classic'} options={LAYOUTS.map((l) => ({ value: l, label: l }))} hint="classic: full-bleed photo hero · editorial: portrait photo, big serif · garden: arched photo · modern: uppercase sans · festive: confetti · quiet: memorial" />
          <Select label="Start from palette preset" name="paletteKey" defaultValue="" options={[{ value: '', label: '— keep the colours below —' }, ...PALETTE_PRESETS.map((p) => ({ value: p.key, label: p.label }))]} hint="Pick a preset and clear the six colours below to apply it." />
          <div className="grid grid-cols-3 gap-2">
            {(['bg', 'surface', 'ink', 'muted', 'accent', 'accent2'] as const).map((k) => (
              <div key={k}><label className="label" htmlFor={k}>{k}</label><input id={k} name={k} type="text" defaultValue={pal[k]} className="field font-mono text-xs" pattern="#[0-9a-fA-F]{6}" /></div>
            ))}
          </div>
          <Select label="Fonts" name="fontsKey" defaultValue={fontsKey} options={FONT_PRESETS.map((f) => ({ value: f.key, label: f.label }))} />
          <div>
            <p className="label">Sections this layout renders</p>
            <div className="grid grid-cols-2 gap-1 text-sm">
              {OCCASION_SECTIONS[occasion].map((k) => (
                <label key={k} className="flex items-center gap-2"><input type="checkbox" name={`section_${k}`} defaultChecked={!t || t.sections.length === 0 || t.sections.includes(k)} className="h-4 w-4" />{SECTION_BY_KEY[k].label}</label>
              ))}
            </div>
            <p className="hint">Unticked sections are hidden on this design but the customer&apos;s data is kept.</p>
          </div>
        </div>
        <div className="lg:col-span-2"><button className="btn btn-primary" type="submit">{isNew ? 'Create template' : 'Save template'}</button></div>
      </form>
    </>
  );
}
