import type { Metadata } from 'next';
import { MessagesPage, invitationMetadata } from '../../shared';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return { ...(await invitationMetadata(slug)), robots: { index: false, follow: false } };
}

/**
 * The same book, for a guest who arrived on their own link.
 *
 * Without this the way back from the book would drop them onto the plain
 * invitation and their personal link would be gone — no name filled in, no
 * seats, nothing the link was for. The token rides through so "back to the
 * invitation" returns them to their own.
 */
export default async function Page({ params }: Params) {
  const { slug, token } = await params;
  return <MessagesPage slug={slug} token={token} />;
}
