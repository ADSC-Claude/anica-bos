import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { OCCASIONS } from '@/lib/occasions';
import { TIERS, TIER_LABELS } from '@/lib/tiers';
import { LAYOUTS, PALETTE_PRESETS, FONT_PRESETS, paletteFrom } from '@/lib/theme';
import { LOOKS, LOOK_BY_KEY, isLook, lookLine, lookTitle, type LineKey, type TitleKey } from '@/lib/looks';
import { wordsOf, artOf, documentOf, offeredSections, LINE_KEYS, TITLE_KEYS, LINE_LABELS, TITLE_LABELS, titleWord, BABYBLUE_GROUNDS, BABYBLUE_GROUND_KEYS, type WordKey } from '@/lib/design';
import { UploadField } from './upload-field';
import { OpeningUpload } from './opening-upload';
import { OCCASION_SECTIONS, SECTION_BY_KEY, sectionLabel, isPaged, type SectionKey } from '@/lib/sections';
import { COLLECTIONS } from '@/lib/collections';
import { OPENINGS } from '@/lib/openings';
import { PageHeader, BackLink, Field, TextArea, Select, Checkbox } from '@/components/ui';
import { AsksSheet, asksFor } from '@/components/asks-sheet';
import { Flash, type FlashParams } from '../../flash';
import { saveTemplateAction } from '../../actions';

export const dynamic = 'force-dynamic';

const GROUND_LABELS: Record<string, string> = {
  cover: 'Cover and Bible verse', story: 'Our Story (drawn: six frames)', invitation: 'The Invitation', sponsors: 'Ninong and Ninang', babyphotos: 'Baby Photos (drawn: four frames)',
  venue: 'The Venue', dresscode: 'Dress Code and Motif', program: 'Gift Request and Program', share: 'Snap and Share, Post Event Photos', closing: 'RSVP, Countdown, Assistance and Ending',
};

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
  // the design's own words and pictures, and the look whose wording they replace
  const words = wordsOf(t?.words);
  const art = artOf(t?.art);
  const look = t?.look && isLook(t.look) ? LOOK_BY_KEY[t.look] : undefined;
  const wordRows: { key: WordKey; label: string; en: string; tl: string }[] = [
    ...TITLE_KEYS.map((k) => ({ key: titleWord(k), label: `Heading — ${TITLE_LABELS[k]}`, en: lookTitle(look, 'en', k) ?? '', tl: lookTitle(look, 'tl', k) ?? '' })),
    ...LINE_KEYS.map((k) => ({ key: k, label: LINE_LABELS[k], en: lookLine(look, 'en', k) ?? '', tl: lookLine(look, 'tl', k) ?? '' })),
  ];
  const tid = t?.id ?? 'new';
  /*
   * What the design itself says it offers. Read from the published document,
   * not the draft: this is the design as it stands, and the draft is the
   * studio's business until it is published.
   */
  const doc = t ? documentOf(t) : null;
  const drawn = Boolean(doc);
  const offers = doc ? offeredSections(doc, occasion) : [];
  const hidden = doc?.hides ?? [];
  return (
    <>
      <BackLink href="/admin/templates">Templates</BackLink>
      <PageHeader
        title={isNew ? 'New template' : t!.name}
        subtitle="A template is a layout, a palette and fonts. Content never lives here."
        actions={t && isPaged(t.layout) ? <Link href={`/admin/templates/${t.id}/design`} className="btn btn-primary btn-sm">Design the pages</Link> : undefined}
      />
      <Flash {...sp} />
      {t && (
        <div className="mb-4">
          <AsksSheet
            asks={asksFor(t, occasion)}
            intro="Every customer on this design is asked for these, and for nothing else the design does not draw."
          />
        </div>
      )}
      <form action={saveTemplateAction.bind(null, t?.id ?? null, isNew ? '/admin/templates/new' : `/admin/templates/${id}`)} className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 p-4">
          <Field label="Name" name="name" defaultValue={t?.name} required />
          <Field label="Slug" name="slug" defaultValue={t?.slug} hint="Lowercase, dashes. Used in URLs and the gallery." />
          <Select label="Occasion" name="occasion" defaultValue={occasion} options={OCCASIONS.map((o) => ({ value: o.key, label: o.label }))} hint="Changing the occasion changes which sections apply — save, then tick sections again." />
          <div>
            <p className="label">Also offered for</p>
            <div className="grid grid-cols-2 gap-1 text-sm">
              {OCCASIONS.map((o) => (
                <label key={o.key} className="flex items-center gap-2"><input type="checkbox" name={`occ_${o.key}`} defaultChecked={t?.occasions.includes(o.key) ?? false} className="h-4 w-4" />{o.label}</label>
              ))}
            </div>
            <p className="hint">A design can suit more than one occasion. Tick the others it should show under on the site and in the checkout; the occasion above is always included, and its sections are what you tick below.</p>
          </div>
          <Select label="Lowest tier" name="minTier" defaultValue={t?.minTier ?? 'BASIC'} options={TIERS.map((x) => ({ value: x, label: x }))} />
          <Select label="Collection" name="collection" defaultValue={t?.collection ?? ''} options={[{ value: '', label: '— none —' }, ...COLLECTIONS.map((c) => ({ value: c.key, label: c.label }))]} hint="The colour family this design is shown under in the gallery." />
          <Select label="Opening" name="opening" defaultValue={t?.opening ?? ''} options={[{ value: '', label: '— none —' }, ...OPENINGS.filter((o) => o.key !== 'none').map((o) => ({ value: o.key, label: `${o.name} — ${o.tagline}` }))]} hint="What this design opens with when the customer has not picked one. Their choice always wins." />
          <Checkbox label={`${TIER_LABELS.COMPLETE} and up (kept out of Basic and Standard)`} name="premium" defaultChecked={t?.premium} />
          <TextArea label="Description" name="description" defaultValue={t?.description} rows={2} />
          <Field label="Thumbnail URL" name="thumbnailUrl" defaultValue={t?.thumbnailUrl} hint="The cover page, portrait (9:16), shown in the gallery and the checkout. Leave blank to show the palette." />
          <OpeningUpload templateId={tid} video={t?.openingVideoUrl ?? ''} poster={t?.openingPosterUrl ?? ''} />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Sort order" name="sortOrder" type="number" defaultValue={t?.sortOrder ?? 0} />
            <div className="pt-6"><Checkbox label="Featured" name="featured" defaultChecked={t?.featured} /></div>
            <div className="pt-6"><Checkbox label="Published" name="published" defaultChecked={t?.published ?? true} /></div>
          </div>
        </div>
        <div className="card space-y-3 p-4">
          <Select label="Layout" name="layout" defaultValue={t?.layout ?? 'classic'} options={LAYOUTS.map((l) => ({ value: l, label: l }))} hint="classic: full-bleed photo hero · editorial: portrait photo, big serif · garden: arched photo · modern: uppercase sans · festive: confetti · quiet: memorial" />
          {/*
            * Where its pages come from, asked once and never again: a design
            * with pages of its own is edited in the studio from then on. A
            * starter is one page per section this occasion offers, on plain
            * colours; the layout's own is Baby Blue's or Capiz's pages
            * exactly, which is the same thing Duplicate makes.
            */}
          {isNew && (
            <Select
              label="Start the pages from"
              name="startFrom"
              defaultValue="starter"
              options={[
                { value: 'starter', label: 'A starter — one page per section you tick, on plain colours' },
                { value: 'layout', label: "The layout's own pages, as Baby Blue and Capiz are built" },
              ]}
              hint="Only for a layout built as a run of pages (Capiz, Baby Blue). Everything else ignores it."
            />
          )}
          <Select label="Start from palette preset" name="paletteKey" defaultValue="" options={[{ value: '', label: '— keep the colours below —' }, ...PALETTE_PRESETS.map((p) => ({ value: p.key, label: p.label }))]} hint="Pick a preset and clear the six colours below to apply it." />
          <div className="grid grid-cols-3 gap-2">
            {(['bg', 'surface', 'ink', 'muted', 'accent', 'accent2'] as const).map((k) => (
              <div key={k}><label className="label" htmlFor={k}>{k}</label><input id={k} name={k} type="text" defaultValue={pal[k]} className="field font-mono text-xs" pattern="#[0-9a-fA-F]{6}" /></div>
            ))}
          </div>
          <Select label="Fonts" name="fontsKey" defaultValue={fontsKey} options={FONT_PRESETS.map((f) => ({ value: f.key, label: f.label }))} hint="Used only when no look is set below." />
          <Select label="Look" name="look" defaultValue={t?.look ?? ''} options={[{ value: '', label: '— none: the fonts above, no lines under the headings —' }, ...LOOKS.map((l) => ({ value: l.key, label: `${l.name} — ${l.tagline}` }))]} hint="A look is a set of faces and the lines under each heading, in English and Tagalog. See /looks for all of them side by side." />
          {/*
            * Which sections this design offers.
            *
            * For a design drawn in the studio this row is retired: the
            * document says which sections the design declines, and a row of
            * ticks beside it would be a second opinion that can only ever
            * drift from the first. The studio is also where the change
            * belongs, because hiding a section changes every invitation
            * already on the design and has to pass the publish screen that
            * says how many that is.
            *
            * A design with no document yet keeps the ticks, because for it
            * there is nothing else to ask.
            */}
          {drawn ? (
            <div>
              <p className="label">Sections this design offers</p>
              <p className="mt-1 text-sm">{offers.length ? offers.map((k) => sectionLabel(k as SectionKey, occasion)).join(', ') : 'None yet.'}</p>
              {hidden.length > 0 && (
                <p className="mt-1 text-sm text-[color:var(--color-ink-500)]">
                  Does not do: {hidden.map((k) => sectionLabel(k as SectionKey, occasion)).join(', ')}
                </p>
              )}
              <p className="hint">
                Read from the design&rsquo;s own pages, so there is nothing to tick here.
                Change it in <Link href={`/admin/templates/${tid}/design`} className="underline">the Design Studio</Link> &mdash; it publishes with the design, which is how you see how many invitations it would redraw first.
              </p>
            </div>
          ) : (
            <div>
              <p className="label">Sections this layout renders</p>
              <div className="grid grid-cols-2 gap-1 text-sm">
                {OCCASION_SECTIONS[occasion].map((k) => (
                  <label key={k} className="flex items-center gap-2"><input type="checkbox" name={`section_${k}`} defaultChecked={!t || t.sections.length === 0 || t.sections.includes(k)} className="h-4 w-4" />{SECTION_BY_KEY[k].label}</label>
                ))}
              </div>
              <p className="hint">Unticked sections are hidden on this design but the customer&apos;s data is kept. A design drawn in the studio says this in its pages instead.</p>
            </div>
          )}
        </div>
        <details className="card p-4 lg:col-span-2">
          <summary className="cursor-pointer font-semibold">Words on the page</summary>
          <p className="hint mt-1">Every heading and every line under one, as this design says it — in English and in Tagalog. Blank keeps the look’s own wording, shown greyed. The couple’s own words always win where the builder collects them.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {wordRows.map((w) => (
              <div key={w.key} className="rounded-lg border border-[color:var(--color-sand-200)] p-2">
                <p className="text-xs font-semibold">{w.label}</p>
                <input name={`words_en_${w.key}`} defaultValue={words.en?.[w.key] ?? ''} placeholder={w.en || 'English'} className="field mt-1 text-sm" aria-label={`${w.label}, English`} />
                <input name={`words_tl_${w.key}`} defaultValue={words.tl?.[w.key] ?? ''} placeholder={w.tl || 'Tagalog'} className="field mt-1 text-sm" aria-label={`${w.label}, Tagalog`} />
              </div>
            ))}
          </div>
        </details>
        <details className="card p-4 lg:col-span-2">
          <summary className="cursor-pointer font-semibold">Pictures</summary>
          <p className="hint mt-1">The design’s own pictures, by URL — upload a file and its URL lands in the field, or paste one. Blank keeps the picture shipped with the layout. {t?.layout === 'babyblue' ? 'Baby Blue lays one ground behind each page, named for the page it sits under; the story and the baby photos grounds are drawn with the frames the photographs go into, so a replacement must keep those where they are.' : 'Backgrounds run down the page in this order, 1 to 7 then 5 and 6 over and over, and 8 is set last.'}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {t?.layout === 'babyblue' && BABYBLUE_GROUND_KEYS.map((k) => (
              <UploadField key={`ground-${k}`} name={`art_ground_${k}`} label={`Ground — ${GROUND_LABELS[k] ?? k}`} defaultValue={art.grounds?.[k] ?? ''} placeholder={BABYBLUE_GROUNDS[k].url} templateId={tid} />
            ))}
            {t?.layout !== 'babyblue' && Array.from({ length: 8 }, (_, i) => (
              <UploadField key={`bg${i}`} name={`art_bg_${i + 1}`} label={`Background ${i + 1}${i === 7 ? ' — set last' : ''}`} defaultValue={art.backgrounds?.[i] ?? ''} placeholder={t?.layout === 'capiz' ? `/capiz/bg-${i + 1}.webp` : ''} templateId={tid} />
            ))}
            {t?.layout !== 'babyblue' && Array.from({ length: 8 }, (_, i) => (
              <UploadField key={`night${i}`} name={`art_night_${i + 1}`} label={`Night background ${i + 1}`} defaultValue={art.night?.[i] ?? ''} templateId={tid} hint={i === 0 ? 'Shown in night mode. With none set, night darkens the day backgrounds instead.' : undefined} />
            ))}
            {t?.layout !== 'babyblue' && <UploadField name="art_strand" label="Strand under the prenup photograph" defaultValue={art.strand ?? ''} placeholder={t?.layout === 'capiz' ? '/capiz/strand-b.webp' : ''} templateId={tid} hint="A wide picture with a transparent background." />}
          </div>
        </details>
        <div className="lg:col-span-2"><button className="btn btn-primary" type="submit">{isNew ? 'Create template' : 'Save template'}</button></div>
      </form>
    </>
  );
}
