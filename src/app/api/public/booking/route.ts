import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { BookingError, createOnlineBooking } from '@/lib/booking';

export const dynamic = 'force-dynamic';

const schema = z.object({
  branchId: z.string().min(1),
  serviceIds: z.array(z.string().min(1)).min(1),
  /** serviceId → minutes of deliberate wait before that treatment. */
  waits: z.record(z.string(), z.number().int().min(0).max(720)).optional(),
  startAtIso: z.string().min(1),
  therapistId: z.string().nullish(),
  resourceId: z.string().nullish(),
  client: z.object({
    name: z.string().min(2, 'Please give your full name.'),
    mobile: z.string().min(7),
    email: z.string().email(),
    birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker for your birthday.'),
    addressCity: z.string().min(2, 'Your city is required.'),
    addressLine: z.string().optional(),
    barangay: z.string().optional(),
  }),
  intake: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().max(1000).optional(),
  consent: z.boolean(),
  // Defaulted rather than required so a request that omits it fails in
  // createOnlineBooking with words a client can act on, not a schema error.
  waiver: z.boolean().default(false),
  promoCode: z.string().optional(),
});

/** Very small in-memory throttle: one submission burst per IP per minute. */
const recent = new Map<string, number[]>();
function throttled(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > 6;
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (throttled(ip)) {
    return NextResponse.json(
      { error: 'Too many booking attempts. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? 'Please check the form and try again.' },
      { status: 400 },
    );
  }

  try {
    const result = await createOnlineBooking(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // Conflict errors thrown by assertNoConflicts are plain Errors.
    const message = (err as Error).message ?? '';
    if (/already booked|already taken/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error('[booking]', err);
    return NextResponse.json(
      { error: 'We could not save that booking. Please try again or call us.' },
      { status: 500 },
    );
  }
}

/** GET /api/public/booking?reference=ANC-XXXXXX — status for the confirmation page. */
export async function GET(req: Request) {
  const reference = new URL(req.url).searchParams.get('reference');
  if (!reference) return NextResponse.json({ error: 'Reference required.' }, { status: 400 });

  const appt = await prisma.appointment.findUnique({
    where: { reference },
    select: {
      reference: true,
      status: true,
      depositStatus: true,
      depositAmountCents: true,
      depositPaidCents: true,
      startAt: true,
      endAt: true,
      client: { select: { name: true } },
      resource: { select: { name: true } },
      services: { select: { service: { select: { name: true } }, employee: { select: { name: true } } } },
    },
  });
  if (!appt) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
  return NextResponse.json(appt);
}
