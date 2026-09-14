import { notFound, redirect } from 'next/navigation';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { contentOf } from '@/lib/invitations';
import { builderPropsFor } from '@/lib/builder-props';
import { Builder } from '@/components/builder/builder';
import { setsFor } from '@/lib/fonts';
import { fontBook } from '@/lib/font-book';
import { getSettings } from '@/lib/settings';
import { checklistFor } from '@/lib/checklist';
import { welcomeDue, welcomeFor } from '@/lib/welcome';
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
  // The parts, the fields, the window: worked out once, for this tab and for
  // the studio's copy of the form alike. What follows is this tab's own.
  const props = builderPropsFor(user.role, inv, section);
  const checklist = checklistFor({ id: inv.id, occasion: inv.occasion, content, tier: inv.tier, addOns: inv.addOns, status: inv.status, saveTheDate: std, layout: inv.template.layout, done: props.done });
  // Where our team types the details in, the two other ways of handing them
  // over stay on offer — up to the point the job is approved.
  const dfy = Boolean(inv.order?.serviceMode && inv.order.serviceMode !== 'DIY') && job;
  const send: SendToUs | null = dfy && job
    ? { method: job.intakeMethod, submittedAt: job.intakeSubmittedAt?.toISOString() ?? null, messenger: s['contact.messenger'], viber: s['contact.viber'], reference: inv.order?.reference ?? '', editable: ['NEW', 'INTAKE_RECEIVED', 'ENCODING', 'REVISION', 'PREVIEW_SENT'].includes(job.status) }
    : null;
  // The first open after paying: the checkout sends the customer straight
  // here, and the receipt, the plan and the offer of a tour sit over the
  // Get-started list until they answer.
  const welcome = welcomeDue(inv, user) ? welcomeFor(user, inv) : null;

  return (
    <Builder
      key={props.current}
      invitationId={inv.id}
      {...props}
      looks={offered.map((l) => ({ key: l.key, name: l.name, tagline: l.tagline }))}
      allLooks={sets.length}
      checklist={checklist}
      send={send}
      welcome={welcome}
    />
  );
}
