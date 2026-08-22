import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { namesMatch, normaliseMobile } from '@/lib/returning-client';

export const dynamic = 'force-dynamic';

/**
 * "Have I been here before?" — answered yes or no, and nothing else.
 *
 * This endpoint is unauthenticated by necessity: the person asking has not
 * booked yet. So it is built to be useless to anybody it was not meant for.
 * It never echoes a name, a booking, or any stored field, and it will not say
 * yes on a number alone — the name has to agree too. Somebody working through
 * mobile numbers learns nothing they did not already type.
 */
const schema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(2),
  mobile: z.string().min(7),
});

/**
 * Slower than the booking throttle, and deliberately.
 *
 * Booking is one considered submission; this fires whenever somebody presses
 * "Find my details". Ten a minute is generous for a guest correcting a typo
 * and useless for walking a number range.
 */
const recent = new Map<string, number[]>();
function throttled(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > 10;
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (throttled(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a minute, or just fill in the form.' },
      { status: 429 },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  // A malformed request gets the same shape of answer as a wrong one. There is
  // nothing to learn from the difference.
  if (!parsed.success) return NextResponse.json({ known: false });

  const mobile = normaliseMobile(parsed.data.mobile);
  if (!mobile) return NextResponse.json({ known: false });

  const client = await prisma.client.findUnique({
    where: { branchId_mobile: { branchId: parsed.data.branchId, mobile } },
    select: { name: true },
  });

  const known = !!client && namesMatch(parsed.data.name, client.name);

  return NextResponse.json({ known });
}
