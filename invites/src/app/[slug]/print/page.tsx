import type { Metadata } from 'next';
import { InvitationPage, invitationMetadata } from '../shared';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return { ...(await invitationMetadata(slug)), robots: { index: false, follow: false } };
}

/** The same page with no envelope, no music, no sticky button — for Ctrl+P / Save as PDF. */
export default async function Page({ params }: Params) {
  const { slug } = await params;
  return <InvitationPage slug={slug} print />;
}
