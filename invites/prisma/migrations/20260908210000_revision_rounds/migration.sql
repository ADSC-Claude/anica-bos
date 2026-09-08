-- Revisions are rounds of changes before we publish, and the package decides
-- how many: 2, 4 and 6 by tier.
--
-- The column already holds those numbers. It was named for the allowance of
-- saves a customer had *after* publishing, which no longer exists — an
-- invitation guests are already opening is ours to change, not theirs — so
-- this is a rename rather than a new column, and every package keeps the
-- number it was already sold with.
ALTER TABLE "Package" RENAME COLUMN "editsAfterPublish" TO "revisionRounds";
