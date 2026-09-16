import 'server-only';
import type { SessionUser } from './auth';
import { prisma } from './db';
import { HttpError } from './errors';
import { audit } from './audit';
import { assertNotPublished, assertOpenForChanges, contentOf, derivedColumns, recordRevision } from './invitations';

/** The versions kept for an invitation, newest first: when, and which part's save made each. */
export function listRevisions(invitationId: string) {
  return prisma.invitationRevision.findMany({ where: { invitationId }, orderBy: { createdAt: 'desc' }, select: { id: true, section: true, title: true, createdAt: true } });
}

/**
 * Put the whole invitation back as it was at one version. The state being
 * left is kept first, as a version of its own, so a restore is undone the
 * same way it was done. A customer restores under the same two locks as any
 * other change to the words and pictures — a live page's are ours — and
 * staff under none.
 */
export async function restoreRevision(user: SessionUser, invitationId: string, revisionId: string) {
  const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
  if (!invitation) throw new HttpError(404, 'That invitation does not exist.');
  assertNotPublished(user, invitation);
  assertOpenForChanges(user, invitation);
  const revision = await prisma.invitationRevision.findFirst({ where: { id: revisionId, invitationId } });
  if (!revision) throw new HttpError(404, 'That version is not here any more.');

  await recordRevision(invitation, 'restore');
  const content = contentOf(revision.content);
  const updated = await prisma.invitation.update({
    where: { id: invitationId },
    data: { content: revision.content as never, ...derivedColumns(invitation.occasion, content) },
  });
  await audit(user, { module: 'invitations', action: 'restore', entityType: 'Invitation', entityId: invitationId, summary: `Restored to the version of ${revision.createdAt.toISOString()}` });
  return { title: updated.title, at: revision.createdAt };
}
