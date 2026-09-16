-- A part one invitation carries that its design does not draw.
--
-- Additive and empty for every row that exists: an invitation with no extra
-- parts renders exactly as it did, which is all of them today.
ALTER TABLE "Invitation" ADD COLUMN "extraSections" TEXT[] DEFAULT ARRAY[]::TEXT[];
