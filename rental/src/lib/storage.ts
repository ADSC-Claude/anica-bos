import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './errors';

/**
 * Supabase Storage over its REST API — no SDK, and the service-role key never
 * leaves the server. Without credentials it writes to `public/uploads`, so
 * development and CI need no cloud account.
 */

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * MIME type by magic bytes, not by the extension the browser claimed. A file
 * called `photo.jpg` is not a JPEG because it says so.
 */
function sniff(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP')
    return 'image/webp';
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export type Stored = { url: string; storagePath: string; contentType: string };

export function storageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Stores a file under a generated path. A user-supplied filename never reaches
 * the storage layer — the caller's `entityType`/`entityId` and a UUID are the
 * whole path.
 */
export async function storeFile(args: {
  file: File;
  entityType: string;
  entityId: string;
  visibility?: 'public' | 'private';
}): Promise<Stored> {
  const bytes = Buffer.from(await args.file.arrayBuffer());
  if (bytes.length === 0) throw new HttpError(400, 'That file is empty.');
  if (bytes.length > MAX_BYTES) throw new HttpError(400, 'Files must be 8 MB or smaller.');

  const contentType = sniff(bytes);
  if (!contentType) throw new HttpError(400, 'Only JPEG, PNG, WebP and PDF files are accepted.');

  const visibility = args.visibility ?? 'private';
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
      ? (process.env.SUPABASE_PUBLIC_BUCKET ?? 'stays-public')
      : (process.env.SUPABASE_PRIVATE_BUCKET ?? 'stays-private');
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

  if (!res.ok) {
    throw new HttpError(502, `Upload failed: ${await res.text()}`);
  }

  return {
    url:
      visibility === 'public'
        ? `${base}/storage/v1/object/public/${bucket}/${objectPath}`
        : `supabase://${bucket}/${objectPath}`,
    storagePath: `${bucket}/${objectPath}`,
    contentType,
  };
}

/**
 * A one-hour link to a private object. Minted per request rather than stored,
 * so a link that escapes into an email thread stops working.
 */
export async function signedUrl(storagePath: string, expiresIn = 3600): Promise<string | null> {
  if (!storageConfigured()) return storagePath.startsWith('/') ? storagePath : `/${storagePath}`;

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
