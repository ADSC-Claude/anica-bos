import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './errors';

/**
 * Supabase Storage over its REST API — no SDK, and the service-role key never
 * leaves the server. Without credentials it writes to `public/uploads`, so
 * development and CI need no cloud account.
 *
 * Cover photos and galleries are public objects: the guest page must serve
 * them to anyone with the link, and a signed URL that expires is a broken
 * hero photo on the wedding day. Proof-of-payment screenshots are private and
 * served through a one-hour signed link to staff only.
 */

const MAX_BYTES = 10 * 1024 * 1024;

/** MIME type by magic bytes, not by the extension the browser claimed. */
function sniff(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP')
    return 'image/webp';
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  // Excel (xlsx) is a zip: PK\x03\x04. Accepted only for intake uploads.
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return null;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export type Stored = { url: string; storagePath: string; contentType: string };

export function storageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function storeFile(args: {
  file: File;
  entityType: string;
  entityId: string;
  visibility?: 'public' | 'private';
  accept?: 'images' | 'images-and-pdf' | 'intake';
}): Promise<Stored> {
  const bytes = Buffer.from(await args.file.arrayBuffer());
  if (bytes.length === 0) throw new HttpError(400, 'That file is empty.');
  if (bytes.length > MAX_BYTES) throw new HttpError(400, 'Files must be 10 MB or smaller.');

  const contentType = sniff(bytes);
  const accept = args.accept ?? 'images';
  const allowed =
    accept === 'images'
      ? ['image/jpeg', 'image/png', 'image/webp']
      : accept === 'images-and-pdf'
        ? ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
        : Object.keys(EXTENSIONS);
  if (!contentType || !allowed.includes(contentType)) {
    throw new HttpError(
      400,
      accept === 'images'
        ? 'Only JPEG, PNG and WebP images are accepted.'
        : 'Only JPEG, PNG, WebP, PDF and Excel files are accepted.',
    );
  }

  const visibility = args.visibility ?? 'public';
  const objectPath = `${args.entityType}/${args.entityId}/${randomUUID()}.${EXTENSIONS[contentType]}`;

  if (!storageConfigured()) {
    const dir = path.join(process.cwd(), 'public', 'uploads', args.entityType, args.entityId);
    await mkdir(dir, { recursive: true });
    const name = objectPath.split('/').pop()!;
    await writeFile(path.join(dir, name), bytes);
    return {
      url: `/uploads/${args.entityType}/${args.entityId}/${name}`,
      storagePath: objectPath,
      contentType,
    };
  }

  const bucket =
    visibility === 'public'
      ? (process.env.SUPABASE_PUBLIC_BUCKET ?? 'invites-public')
      : (process.env.SUPABASE_PRIVATE_BUCKET ?? 'invites-private');
  const base = process.env.SUPABASE_URL!.replace(/\/$/, '');

  const res = await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
    body: new Uint8Array(bytes),
  });

  if (!res.ok) throw new HttpError(502, `Upload failed: ${await res.text()}`);

  return {
    url:
      visibility === 'public'
        ? `${base}/storage/v1/object/public/${bucket}/${objectPath}`
        : `supabase://${bucket}/${objectPath}`,
    storagePath: `${bucket}/${objectPath}`,
    contentType,
  };
}

/** A one-hour link to a private object, minted per request rather than stored. */
export async function signedUrl(storagePath: string, expiresIn = 3600): Promise<string | null> {
  if (!storageConfigured()) return storagePath.startsWith('/') ? storagePath : `/uploads/${storagePath}`;

  const [bucket, ...rest] = storagePath.split('/');
  const objectPath = rest.join('/');
  const base = process.env.SUPABASE_URL!.replace(/\/$/, '');

  const res = await fetch(`${base}/storage/v1/object/sign/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { signedURL?: string };
  return json.signedURL ? `${base}/storage/v1${json.signedURL}` : null;
}
