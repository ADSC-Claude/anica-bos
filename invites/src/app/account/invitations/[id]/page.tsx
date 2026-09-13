import { notFound, redirect } from 'next/navigation';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { contentOf } from '@/lib/invitations';
import { sectionOrder, sectionLabel, sectionMinTier, sectionUnlocked, sectionFilled, sectionAlwaysShows, fieldsFor, customerFields, emptySection, photoFrames, photoFramesHint, SECTION_BY_KEY, SAVE_THE_DATE_SECTIONS, type SectionKey } from '@/lib/sections';
import { documentOf } from '@/lib/design';
import { designForm, askedFields, askedLimits, designMedia } from '@/lib/asks';
import { isStaff } from '@/lib/rbac';
import { galleryLimit } from '@/lib/tiers';
import { Builder } from '@/components/builder/builder';
import { setsFor } from '@/lib/fonts';
import { fontBook } from '@/lib/font-book';
import { getSettings } from '@/lib/settings';
import { changeWindow, doneSections } from '@/lib/progress';
import { checklistFor } from '@/lib/checklist';
import type { SendToUs } from '@/components/account/checklist';

export const dynamic = 'force-dynamic';

/**
 * The Invitation tab: the form beside the page. One part at a time, chosen
 * by ?section= (the first unlocked one by default), in the order the design
 * shows them, so the steps down the form are the steps down the page.
 */
export default async function InvitationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ section?: string }> }) {
  const { id } = await params;
  const { section } = await searchParams;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  if (inv.order && inv.order.status !== 'ACTIVE' && inv.order.status !== 'PAID') redirect(`/checkout/pay/${inv.order.reference}`);

  const content = contentOf(inv.content);
  // The pairings she has switched on, narrowed by the package and by what
  // this design offers — the same list the Settings picker draws from.
  const [sets, s, job] = await Promise.all([fontBook(), getSettings(), prisma.dfyJob.findUnique({ where: { invitationId: inv.id }, select: { status: true, intakeMethod: true, intakeSubmittedAt: true } })]);
  const offered = setsFor(inv.tier, sets, inv.template.fontSets);
  const std = Boolean(inv.saveTheDateOfId);
  const keys = sectionOrder(inv.occasion, inv.template.layout).filter((k) => !std || SAVE_THE_DATE_SECTIONS.includes(k));
  const defs = keys.map((k) => SECTION_BY_KEY[k]).filter((d) => !d.hidden);
  const sections = defs.map((d) => ({
    key: d.key,
    label: sectionLabel(d.key, inv.occasion),
    description: d.description,
    unlocked: sectionUnlocked(d.key, inv.occasion, inv.tier, inv.addOns),
    filled: sectionFilled(d.key, inv.occasion, content[d.key]),
    minTier: sectionMinTier(d.key, inv.occasion),
  }));
  const current = (sections.find((x) => x.key === section && x.unlocked)?.key ?? sections.find((x) => x.unlocked)!.key) as SectionKey;
  /*
   * The form this design asks for. A design that says nothing gives back the
   * very fields it was handed, so every invitation on a design with no
   * document of its own — which is all of them today — sees exactly the form
   * it saw before. The fixed writings are ours: staff editing for the
   * customer see them, the customer does not.
   */
  const form = designForm(documentOf(inv.template), inv.occasion);
  const all = designMedia(fieldsFor(current, inv.occasion, inv.tier, std), current, form);
  const own = isStaff(user.role) ? all : customerFields(all);
  const fields = askedFields(own, current, form);
  const initial = { ...emptySection(fields), ...(content[current] ?? {}) };
  const limit = galleryLimit(inv.tier);
  const done = doneSections(content.progress);
  const hidesWhenEmpty = !sectionAlwaysShows(current);
  const w = changeWindow(inv.eventAt);
  const window = w ? { closesAt: w.closesAt.toISOString(), finalAt: w.finalAt.toISOString(), closed: w.closed } : null;
  const checklist = checklistFor({ id: inv.id, occasion: inv.occasion, content, tier: inv.tier, addOns: inv.addOns, status: inv.status, saveTheDate: std, layout: inv.template.layout, done });
  // Where our team types the details in, the two other ways of handing them
  // over stay on offer — up to the point the job is approved.
  const dfy = Boolean(inv.order?.serviceMode && inv.order.serviceMode !== 'DIY') && job;
  const send: SendToUs | null = dfy && job
    ? { method: job.intakeMethod, submittedAt: job.intakeSubmittedAt?.toISOString() ?? null, messenger: s['contact.messenger'], viber: s['contact.viber'], reference: inv.order?.reference ?? '', editable: ['NEW', 'INTAKE_RECEIVED', 'ENCODING', 'REVISION', 'PREVIEW_SENT'].includes(job.status) }
    : null;

  return (
    <Builder
      key={current}
      invitationId={inv.id}
      slug={inv.slug}
      status={inv.status}
      sections={sections}
      current={current}
      fields={fields}
      initial={initial}
      done={done}
      hidesWhenEmpty={hidesWhenEmpty}
      completedAt={content.progress?.completedAt ?? null}
      window={window}
      lang={inv.language === 'tl' ? 'tl' : 'en'}
      listLimits={{ photos: Math.min(limit === Infinity ? 200 : limit, photoFrames(inv.template.layout)), ...askedLimits(current, form) }}
      listHints={photoFramesHint(inv.template.layout)}
      lookKey={content.theme?.lookKey ?? ''}
      looks={offered.map((l) => ({ key: l.key, name: l.name, tagline: l.tagline }))}
      allLooks={sets.length}
      tier={inv.tier}
      checklist={checklist}
      send={send}
    />
  );
}
