-- A design's words and pictures, editable in the admin: the lines and headings
-- it writes over its look's, per language, and the URLs of its own pictures
-- (backgrounds by day and by night, the strand). Blank means the code's own.
ALTER TABLE "Template" ADD COLUMN "words" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Template" ADD COLUMN "art" JSONB NOT NULL DEFAULT '{}';
