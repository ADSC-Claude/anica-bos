import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, open, rm, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { HttpError } from './errors';
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from './album';
import { VIDEO_TYPES } from './clips';
import { MOVING_TYPES } from './moving';

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

const MAX_BYTES = PHOTO_MAX_BYTES;

/** MIME type by magic bytes, not by the extension the browser claimed. */
function sniff(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP')
    return 'image/webp';
  /*
   * GIF, which is only ever a moving picture here. Whether it actually moves
   * is a question about the blocks inside it and not about the header, and it
   * is asked in the browser before the file is sent (`movingPicture`) — the
   * same division as a clip's codec, and for the same reason: the container
   * says nothing about what is in it.
   */
  const gif = buffer.subarray(0, 6).toString('ascii');
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  // MP3: an ID3 tag in front, or a bare frame — its sync bits set, layer III
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';
  if (buffer[0] === 0xff && (buffer[1] & 0xe6) === 0xe2) return 'audio/mpeg';
  // M4A: an MP4 container that declares itself audio. Checked before the
  // general MP4 rule below, because both are `ftyp` boxes and only the brand
  // tells them apart — a song read as a clip would be offered a poster.
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp' && buffer.subarray(8, 12).toString('ascii') === 'M4A ') return 'audio/mp4';
  /*
   * MP4 video: any other `ftyp` brand. Brands are many and vendors invent
   * them — isom, iso2, mp41, mp42, avc1, M4V, dash, qt — so the brand is not
   * an allowlist here. What a clip is actually encoded with is read in the
   * browser before it is ever sent (H.264 Baseline or Main, AAC or silent),
   * because a container tells you nothing about the codec inside it and a
   * server with no ffmpeg cannot find out.
   */
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  /*
   * WebM: the EBML header, and the `webm` DocType within it. Matroska shares
   * the header, so without the DocType an .mkv would be accepted and then
   * play for nobody; it is refused with the rest.
   */
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
    return buffer.subarray(0, 64).includes(Buffer.from('webm', 'ascii')) ? 'video/webm' : null;
  // Excel (xlsx) is a zip: PK\x03\x04. Accepted only for intake uploads.
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  /*
   * JSON, which has no magic bytes at all: a vector animation is an object
   * and the only way to know is to read it. Cheap in practice — anything
   * that does not open with a brace is not attempted, and the weight cap has
   * already been applied above, so the parse is bounded.
   *
   * Whether a given JSON is an *animation* is a different question, asked by
   * `readLottie` where the answer can be explained. This one only says what
   * kind of file it is, which is what the rest of this function does.
   */
  if (buffer[0] === 0x7b) {
    try {
      JSON.parse(buffer.toString('utf8'));
      return 'application/json';
    } catch {
      return null;
    }
  }
  return null;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/json': 'json',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

const IMAGE_TYPES = [...PHOTO_TYPES];
/** A song file: MP3, or M4A from an iPhone. */
export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4'];
/** The most a song file may weigh — more than a photo: four minutes of MP3 at a good bitrate is six to ten MB. */
export const AUDIO_MAX_BYTES = 20 * 1024 * 1024;

export type Accept = 'images' | 'images-and-pdf' | 'intake' | 'audio' | 'video' | 'moving' | 'lottie';
const ACCEPTS: Record<Accept, { types: string[]; message: string }> = {
  images: { types: IMAGE_TYPES, message: 'Only JPEG, PNG and WebP images are accepted.' },
  'images-and-pdf': { types: [...IMAGE_TYPES, 'application/pdf'], message: 'Only JPEG, PNG, WebP and PDF files are accepted.' },
  intake: { types: [...IMAGE_TYPES, 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], message: 'Only JPEG, PNG, WebP, PDF and Excel files are accepted.' },
  audio: { types: AUDIO_TYPES, message: 'Only MP3 and M4A audio files are accepted.' },
  video: { types: [...VIDEO_TYPES], message: 'Only MP4 and WebM video files are accepted. An .mov from an iPhone needs exporting as MP4 first.' },
  /*
   * A moving picture: a GIF, an animated WebP, an animated PNG. The three
   * types are the only ones a browser will animate in an <img>, and two of
   * them are the same type as their still versions — so this accepts the
   * container and the browser has already read the bytes that say it moves.
   */
  moving: { types: [...MOVING_TYPES], message: 'A moving picture must be a GIF, an animated WebP or an animated PNG.' },
  /* A vector animation is JSON; whether that JSON is a Lottie is asked by the route, which can say why not. */
  lottie: { types: ['application/json'], message: 'A vector animation must be a Lottie JSON file.' },
};

/**
 * A design's own folder in storage, from whatever the form sent.
 *
 * Narrowed rather than trusted: the value becomes a path segment, so
 * anything that is not a letter, a digit or a hyphen is dropped — `../../etc`
 * comes out as `etc`, a folder name and not an escape. Forty characters is a
 * cuid with room to spare. Empty becomes `shared`, which is where a file
 * uploaded before its design exists goes.
 *
 * This is one of two locks, not the only one: `directUploadUrl` independently
 * refuses any stored path that does not begin with this design's own folder,
 * so a committed file cannot be pointed at somebody else's design even if
 * this let something through.
 */
export function designFolder(raw: unknown): string {
  // Only a string is a name. Coercing anything else turns `{}` into the
  // folder `objectObject`, which is not an escape but is not a design's
  // folder either — a file would quietly land somewhere nobody looks.
  if (typeof raw !== 'string') return 'shared';
  return raw.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40) || 'shared';
}

export type Stored = { url: string; storagePath: string; contentType: string };

export function storageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function storeFile(args: {
  file: File;
  entityType: string;
  entityId: string;
  visibility?: 'public' | 'private';
  accept?: Accept;
  /** The most the file may weigh; a photo's 10 MB unless said otherwise. */
  maxBytes?: number;
}): Promise<Stored> {
  const bytes = Buffer.from(await args.file.arrayBuffer());
  if (bytes.length === 0) throw new HttpError(400, 'That file is empty.');
  const maxBytes = args.maxBytes ?? MAX_BYTES;
  if (bytes.length > maxBytes) throw new HttpError(400, `Files must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`);

  const contentType = sniff(bytes);
  const { types, message } = ACCEPTS[args.accept ?? 'images'];
  if (!contentType || !types.includes(contentType)) throw new HttpError(400, message);

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

/**
 * Reads a stored object back, as a stream.
 *
 * For downloading an album: the caller writes each photograph straight into a
 * ZIP without ever holding it, so five hundred of them cost one file's memory
 * rather than the album's. Null when the object is gone, which a download
 * skips rather than fails on — a row whose file has vanished should not lose
 * the couple the other four hundred and ninety-nine.
 *
 * `storagePath` is what `storeFile` returned, not a URL: the object is read
 * through the service key rather than its public address, so this works the
 * same for a private bucket and does not depend on what the CDN is serving.
 */
export async function openFile(storagePath: string): Promise<ReadableStream<Uint8Array> | null> {
  if (!storageConfigured()) {
    const file = path.join(process.cwd(), 'public', 'uploads', storagePath);
    try {
      const handle = await open(file, 'r');
      return Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array>;
    } catch {
      return null;
    }
  }

  const base = process.env.SUPABASE_URL!.replace(/\/$/, '');
  const res = await fetch(`${base}/storage/v1/object/${storagePath}`, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok || !res.body) return null;
  return res.body as ReadableStream<Uint8Array>;
}

/**
 * Removes a stored object. Best effort by design: the caller has already
 * deleted the row that pointed at it, and a file left behind in a bucket is a
 * smaller problem than an error thrown at someone deleting a photo.
 */
export async function deleteFile(storagePath: string): Promise<void> {
  if (!storageConfigured()) {
    // The development fallback writes under public/uploads. `storagePath` is
    // relative to that directory.
    try {
      await rm(path.join(process.cwd(), 'public', 'uploads', storagePath), { force: true });
    } catch {
      /* already gone */
    }
    return;
  }

  const [bucket, ...rest] = storagePath.split('/');
  if (!bucket || !rest.length) return;
  const base = process.env.SUPABASE_URL!.replace(/\/$/, '');
  try {
    await fetch(`${base}/storage/v1/object/${bucket}/${rest.join('/')}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
  } catch {
    /* already gone, or a transient failure — not worth failing the delete for */
  }
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

/**
 * A signed address the browser uploads a file to directly, for one too big to
 * pass through the server: a serverless function takes a request body of 4.5
 * MB at most, and a song is often more. The file's type is fixed here, so the
 * object is named for it; the browser puts the bytes, and the caller records
 * the object once it is there (`directUploadUrl`). Null without cloud
 * storage — development and CI then take the file through the server.
 */
export async function signedUpload(args: { entityType: string; entityId: string; contentType: string }): Promise<{ uploadUrl: string; storagePath: string; url: string } | null> {
  if (!storageConfigured()) return null;
  const ext = EXTENSIONS[args.contentType];
  if (!ext) throw new HttpError(400, 'That kind of file is not accepted.');
  const bucket = process.env.SUPABASE_PUBLIC_BUCKET ?? 'invites-public';
  const base = process.env.SUPABASE_URL!.replace(/\/$/, '');
  const objectPath = `${args.entityType}/${args.entityId}/${randomUUID()}.${ext}`;
  const res = await fetch(`${base}/storage/v1/object/upload/sign/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new HttpError(502, `Could not prepare the upload: ${await res.text()}`);
  const json = (await res.json()) as { url?: string };
  if (!json.url) throw new HttpError(502, 'Could not prepare the upload.');
  return {
    uploadUrl: `${base}/storage/v1${json.url}`,
    storagePath: `${bucket}/${objectPath}`,
    url: `${base}/storage/v1/object/public/${bucket}/${objectPath}`,
  };
}

/**
 * The public address of an object the browser uploaded directly — only when
 * its path is this entity's own, so nobody records another's file as theirs.
 */
export function directUploadUrl(storagePath: string, entityType: string, entityId: string): string | null {
  if (!storageConfigured()) return null;
  const bucket = process.env.SUPABASE_PUBLIC_BUCKET ?? 'invites-public';
  if (storagePath.includes('..') || !storagePath.startsWith(`${bucket}/${entityType}/${entityId}/`)) return null;
  const base = process.env.SUPABASE_URL!.replace(/\/$/, '');
  return `${base}/storage/v1/object/public/${storagePath}`;
}

/** Whether a public object is there — checked after a direct upload, before its row is written. */
export async function publicObjectExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}
