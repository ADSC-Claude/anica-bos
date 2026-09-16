import { redirect } from 'next/navigation';

/**
 * "Your details & preview" is two tabs now: the details are the Invitation
 * tab, the same form every customer fills, and the preview and approval
 * thread is on Share, where publishing happens.
 */
export default async function DfyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/account/invitations/${id}/share`);
}
