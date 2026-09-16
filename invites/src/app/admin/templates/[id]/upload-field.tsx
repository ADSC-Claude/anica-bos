'use client';

import { UploadField as Base } from '@/components/admin/upload-field';

/** The design editor's upload: the file lands under the design it belongs to. */
export function UploadField({ templateId, ...rest }: Parameters<typeof Base>[0] & { templateId: string }) {
  return <Base {...rest} endpoint="/api/admin/upload" extra={{ templateId }} />;
}
