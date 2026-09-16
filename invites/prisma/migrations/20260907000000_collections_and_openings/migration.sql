-- Collections group templates by colour family; openings are the moving scene
-- a guest sees before the invitation.
ALTER TABLE "Template" ADD COLUMN "collection" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Template" ADD COLUMN "opening" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Template_collection_published_sortOrder_idx" ON "Template"("collection", "published", "sortOrder");

-- Carry the old cover toggle over to the new choice. An invitation built
-- before this migration says {"cover": {"envelope": true}} and means the
-- envelope opening; one that says false meant no opening at all. Leaving
-- either unset would hand the guest the design's default instead of the
-- choice the customer already made.
UPDATE "Invitation"
SET content = jsonb_set(content, '{cover,opening}', '"envelope"', true)
WHERE content #> '{cover}' IS NOT NULL
  AND content #>> '{cover,envelope}' = 'true'
  AND content #>> '{cover,opening}' IS NULL;

UPDATE "Invitation"
SET content = jsonb_set(content, '{cover,opening}', '"none"', true)
WHERE content #> '{cover}' IS NOT NULL
  AND content #>> '{cover,envelope}' = 'false'
  AND content #>> '{cover,opening}' IS NULL;
