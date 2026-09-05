import type { Metadata } from 'next';
import { InvitationPage, invitationMetadata } from '../shared';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ wrong?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const meta = await invitationMetadata(slug);
  // A personal link is nobody's business but its holder's.
  return { ...meta, robots: { index: false, follow: false } };
}

export default async function Page({ params, searchParams }: Params) {
  const { slug, token } = await params;
  const { wrong } = await searchParams;
  return <InvitationPage slug={slug} token={token} wrongPassword={wrong === '1'} />;
}
