import { Notice } from '@/components/ui';

/** Reads ?ok= / ?error= that admin actions redirect with. */
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <div className="mb-4"><Notice tone="bad">{error}</Notice></div>;
  if (ok) return <div className="mb-4"><Notice tone="ok">{ok}</Notice></div>;
  return null;
}

export type FlashParams = { ok?: string; error?: string };
