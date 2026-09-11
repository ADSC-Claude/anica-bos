import type { Metadata } from 'next';
import { InvitationPage, PeekPage, invitationMetadata } from './shared';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ wrong?: string; bare?: string; peek?: string; design?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return invitationMetadata(slug);
}

export default async function Page({ params, searchParams }: Params) {
  const { slug } = await params;
  const { wrong, bare, peek, design } = await searchParams;
  if (peek === '1') return <PeekPage slug={slug} />;
  return <InvitationPage slug={slug} wrongPassword={wrong === '1'} bare={bare === '1'} draft={design === 'draft'} />;
}
