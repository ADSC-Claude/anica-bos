-- The library: pieces uploaded once and usable in any design, so they belong
-- to no template and to no couple. A name and the words she would search for
-- it by; blank on everything else, because nobody tags a guest's photo.
ALTER TYPE "MediaKind" ADD VALUE 'DESIGN_PIECE';

ALTER TABLE "Media" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Media" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- The drawer lists the newest first, across every design.
CREATE INDEX "Media_kind_createdAt_idx" ON "Media"("kind", "createdAt");
