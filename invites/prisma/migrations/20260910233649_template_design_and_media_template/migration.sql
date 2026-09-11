-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MediaKind" ADD VALUE 'DESIGN_IMAGE';
ALTER TYPE "MediaKind" ADD VALUE 'DESIGN_VIDEO';

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "bytes" INTEGER,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "width" INTEGER;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "design" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "designDraft" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "designDraftRev" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Media_templateId_kind_sortOrder_idx" ON "Media"("templateId", "kind", "sortOrder");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
