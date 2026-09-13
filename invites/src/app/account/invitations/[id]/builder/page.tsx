import { redirect } from 'next/navigation';

/** The builder is the Invitation tab now; an old link still lands on the same part. */
export default async function BuilderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ section?: string }> }) {
  const { id } = await params;
  const { section } = await searchParams;
  redirect(`/account/invitations/${id}${section ? `?section=${encodeURIComponent(section)}` : ''}`);
}
