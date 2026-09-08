-- The invitation that shows a design off, for the visitor's peek from the
-- opening to Our Story. Blank offers no peek.
ALTER TABLE "Template" ADD COLUMN "demoSlug" TEXT NOT NULL DEFAULT '';
