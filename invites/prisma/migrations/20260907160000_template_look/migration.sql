-- A design's look: the faces it is set in and the lines it writes under its
-- headings, chosen from src/lib/looks.ts. Capiz is set in Heritage, the look
-- its reference was drawn from.
ALTER TABLE "Template" ADD COLUMN "look" TEXT NOT NULL DEFAULT '';
UPDATE "Template" SET "look" = 'heritage' WHERE "slug" = 'capiz';
