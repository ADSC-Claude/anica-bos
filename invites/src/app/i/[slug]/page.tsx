import type { Metadata } from 'next';
import { InvitationPage, invitationMetadata } from './shared';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ wrong?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return invitationMetadata(slug);
}

export default async function Page({ params, searchParams }: Params) {
  const { slug } = await params;
  const { wrong } = await searchParams;
  return <InvitationPage slug={slug} wrongPassword={wrong === '1'} />;
}
