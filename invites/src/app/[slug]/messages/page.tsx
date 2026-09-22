import type { Metadata } from 'next';
import { MessagesPage, invitationMetadata } from '../shared';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  // Guests' own words, kept out of Google — the same as every other page
  // reached from an invitation rather than from the site.
  return { ...(await invitationMetadata(slug)), robots: { index: false, follow: false } };
}

/** Every message guests have written, on a page of its own. */
export default async function Page({ params }: Params) {
  const { slug } = await params;
  return <MessagesPage slug={slug} />;
}
